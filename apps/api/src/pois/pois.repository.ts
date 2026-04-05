import { Injectable } from '@nestjs/common'
import { db, accommodationsCache, adventureSegments, adventures } from '@ridenrest/database'
import { eq, and, gte, lte, sql, inArray } from 'drizzle-orm'
import type { OverpassNode } from './providers/overpass.provider.js'
import type { Poi } from '@ridenrest/shared'

@Injectable()
export class PoisRepository {
  /** Retrieve cached POIs for a segment from accommodations_cache, filtered by categories and km range. */
  async findCachedPois(
    segmentId: string,
    categories: string[],
    fromKm: number,
    toKm: number,
  ): Promise<Poi[]> {
    const now = new Date()
    const rows = await db
      .select()
      .from(accommodationsCache)
      .where(
        and(
          eq(accommodationsCache.segmentId, segmentId),
          gte(accommodationsCache.expiresAt, now),
          inArray(accommodationsCache.category, categories),
          gte(accommodationsCache.distAlongRouteKm, fromKm),
          lte(accommodationsCache.distAlongRouteKm, toKm),
        ),
      )
    return rows.map((r) => ({
      id: r.id,
      externalId: r.externalId,
      source: r.source as 'overpass' | 'amadeus' | 'google',
      category: r.category as Poi['category'],
      name: r.name,
      lat: r.lat,
      lng: r.lng,
      distFromTraceM: r.distFromTraceM,
      distAlongRouteKm: r.distAlongRouteKm,
      rawData: r.rawData as Record<string, unknown> | undefined,
    }))
  }

  /** Insert Overpass results into accommodations_cache (upsert on conflict). */
  async insertOverpassPois(
    segmentId: string,
    nodes: OverpassNode[],
    categoryMap: Record<number, string>,
    expiresAt: Date,
  ): Promise<void> {
    if (nodes.length === 0) return

    const values = nodes.map((node) => {
      const lat = node.center?.lat ?? node.lat
      const lon = node.center?.lon ?? node.lon
      return {
        segmentId,
        externalId: String(node.id),
        source: 'overpass' as const,
        category: categoryMap[node.id] ?? 'hotel',
        name: node.tags.name ?? node.tags['name:en'] ?? 'Unknown',
        lat,
        lng: lon,
        distFromTraceM: 0,      // ← Will be updated by PostGIS query in Story 4.3
        distAlongRouteKm: 0,    // ← Will be updated by PostGIS query in Story 4.3
        rawData: node.tags as Record<string, unknown>,
        cachedAt: new Date(),
        expiresAt,
      }
    })

    await db
      .insert(accommodationsCache)
      .values(values)
      .onConflictDoUpdate({
        target: [
          accommodationsCache.segmentId,
          accommodationsCache.externalId,
          accommodationsCache.source,
        ],
        set: {
          name: sql`excluded.name`,
          lat: sql`excluded.lat`,
          lng: sql`excluded.lng`,
          rawData: sql`excluded.raw_data`,
          cachedAt: sql`excluded.cached_at`,
          expiresAt: sql`excluded.expires_at`,
        },
      })
  }

  /**
   * Update distFromTraceM and distAlongRouteKm for POIs using PostGIS.
   * Requires adventure_segments.geom (PostGIS LineString) to be populated.
   * Only updates rows where dist_from_trace_m = 0 (freshly inserted).
   */
  async updatePoiDistances(segmentId: string): Promise<void> {
    // PostGIS ST_Distance (meters) and ST_LineLocatePoint (0→1 fraction)
    // Only update rows where dist_from_trace_m = 0 (freshly inserted)
    await db.execute(sql`
      UPDATE accommodations_cache ac
      SET
        dist_from_trace_m = ST_Distance(
          ST_SetSRID(ST_MakePoint(ac.lng, ac.lat), 4326)::geography,
          seg.geom::geography
        ),
        dist_along_route_km = ROUND(
          (ST_LineLocatePoint(seg.geom, ST_ClosestPoint(seg.geom, ST_SetSRID(ST_MakePoint(ac.lng, ac.lat), 4326)))
          * seg.distance_km)::numeric,
          2
        )
      FROM adventure_segments seg
      WHERE ac.segment_id = ${segmentId}
        AND seg.id = ${segmentId}
        AND ac.dist_from_trace_m = 0
        AND seg.geom IS NOT NULL
    `)
  }

  /** Check if a Google POI (by place_id) is already inserted for this segment. */
  async googlePoiExistsInSegment(placeId: string, segmentId: string): Promise<boolean> {
    const rows = await db
      .select({ id: accommodationsCache.id })
      .from(accommodationsCache)
      .where(
        and(
          eq(accommodationsCache.segmentId, segmentId),
          eq(accommodationsCache.externalId, placeId),
          eq(accommodationsCache.source, 'google'),
        ),
      )
      .limit(1)
    return rows.length > 0
  }

  /** Check if any POI already exists within radiusM meters of (lat, lng) for the given segment. */
  async hasNearbyPoi(lat: number, lng: number, radiusM: number, segmentId: string): Promise<boolean> {
    const result = await db.execute(sql`
      SELECT 1 FROM accommodations_cache
      WHERE segment_id = ${segmentId}
        AND ST_DWithin(
          ST_SetSRID(ST_MakePoint(accommodations_cache.lng, accommodations_cache.lat), 4326)::geography,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radiusM}
        )
      LIMIT 1
    `)
    return result.rows.length > 0
  }

  /** Insert Google Places POIs into accommodations_cache (upsert on conflict). */
  async insertGooglePois(
    segmentId: string,
    places: Array<{
      placeId: string
      name: string
      lat: number
      lng: number
      category: string
      rawData: Record<string, unknown>
    }>,
    expiresAt: Date,
  ): Promise<void> {
    if (places.length === 0) return

    const values = places.map((p) => ({
      segmentId,
      externalId: p.placeId,
      source: 'google' as const,
      category: p.category,
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      distFromTraceM: 0,
      distAlongRouteKm: 0,
      rawData: p.rawData,
      cachedAt: new Date(),
      expiresAt,
    }))

    await db
      .insert(accommodationsCache)
      .values(values)
      .onConflictDoUpdate({
        target: [
          accommodationsCache.segmentId,
          accommodationsCache.externalId,
          accommodationsCache.source,
        ],
        set: {
          name: sql`excluded.name`,
          lat: sql`excluded.lat`,
          lng: sql`excluded.lng`,
          rawData: sql`excluded.raw_data`,
          cachedAt: sql`excluded.cached_at`,
          expiresAt: sql`excluded.expires_at`,
        },
      })
  }

  /**
   * Insert raw POIs (without distances) for cross-user cache hit hydration (Option A).
   * On conflict, only refreshes TTL — preserves computed distances if row already exists.
   * New rows are inserted with distances=0 so updatePoiDistances will compute them.
   */
  async insertRawPoisForSegment(
    segmentId: string,
    pois: Array<{ externalId: string; source: 'overpass' | 'amadeus' | 'google'; name: string; lat: number; lng: number; category: string; rawData?: Record<string, unknown> }>,
    expiresAt: Date,
  ): Promise<void> {
    if (pois.length === 0) return

    const values = pois.map((p) => ({
      segmentId,
      externalId: p.externalId,
      source: p.source,
      category: p.category,
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      distFromTraceM: 0,
      distAlongRouteKm: 0,
      rawData: p.rawData ?? ({} as Record<string, unknown>),
      cachedAt: new Date(),
      expiresAt,
    }))

    await db
      .insert(accommodationsCache)
      .values(values)
      .onConflictDoUpdate({
        target: [
          accommodationsCache.segmentId,
          accommodationsCache.externalId,
          accommodationsCache.source,
        ],
        set: {
          // Only refresh TTL — preserve existing computed distances
          cachedAt: sql`excluded.cached_at`,
          expiresAt: sql`excluded.expires_at`,
        },
      })
  }

  /** Find POI name and coordinates by externalId + segmentId for Google Details lookup. */
  async findByExternalId(
    externalId: string,
    segmentId: string,
  ): Promise<{ name: string; lat: number; lng: number } | null> {
    const rows = await db
      .select({ name: accommodationsCache.name, lat: accommodationsCache.lat, lng: accommodationsCache.lng })
      .from(accommodationsCache)
      .where(
        and(
          eq(accommodationsCache.externalId, externalId),
          eq(accommodationsCache.segmentId, segmentId),
        ),
      )
      .limit(1)
    return rows[0] ?? null
  }

  /** Find POIs near a target point using PostGIS ST_DWithin (live mode). */
  async findPoisNearPoint(
    segmentId: string,
    targetLat: number,
    targetLng: number,
    radiusM: number,
    categories: string[],
  ): Promise<Poi[]> {
    const now = new Date()
    const rows = await db.execute(sql`
      SELECT
        ac.id,
        ac.external_id,
        ac.source,
        ac.category,
        ac.name,
        ac.lat,
        ac.lng,
        ac.dist_from_trace_m,
        ac.dist_along_route_km,
        ac.raw_data,
        ST_Distance(
          ST_SetSRID(ST_MakePoint(ac.lng, ac.lat), 4326)::geography,
          ST_SetSRID(ST_MakePoint(${targetLng}, ${targetLat}), 4326)::geography
        ) AS dist_from_target_m
      FROM accommodations_cache ac
      WHERE ac.segment_id = ${segmentId}
        AND ac.category = ANY(ARRAY[${sql.join(categories.map((c) => sql`${c}`), sql.raw(', '))}])
        AND ac.expires_at > ${now}
        AND ST_DWithin(
          ST_SetSRID(ST_MakePoint(ac.lng, ac.lat), 4326)::geography,
          ST_SetSRID(ST_MakePoint(${targetLng}, ${targetLat}), 4326)::geography,
          ${radiusM}
        )
      ORDER BY dist_from_target_m ASC
    `)
    return rows.rows.map((r) => ({
      id: r.id as string,
      externalId: r.external_id as string,
      source: r.source as 'overpass' | 'amadeus' | 'google',
      category: r.category as Poi['category'],
      name: r.name as string,
      lat: r.lat as number,
      lng: r.lng as number,
      distFromTraceM: r.dist_from_trace_m as number,
      distAlongRouteKm: r.dist_along_route_km as number,
      distFromTargetM: Math.round(r.dist_from_target_m as number),
      rawData: r.raw_data as Record<string, unknown> | undefined,
    }))
  }

  /**
   * Interpolate a point at a given km distance along a segment's waypoints.
   * Returns null if segment not found or does not belong to userId.
   */
  async getWaypointAtKm(
    segmentId: string,
    targetKm: number,
    userId: string,
  ): Promise<{ lat: number; lng: number } | null> {
    const waypoints = await this.getSegmentWaypoints(segmentId, userId)
    if (!waypoints || waypoints.length < 2) return null

    // targetKm before route start — clamp to first waypoint
    if (targetKm <= waypoints[0].distKm) {
      return { lat: waypoints[0].lat, lng: waypoints[0].lng }
    }

    // Find bracketing waypoints and interpolate
    for (let i = 0; i < waypoints.length - 1; i++) {
      const a = waypoints[i]
      const b = waypoints[i + 1]
      if (a.distKm <= targetKm && targetKm <= b.distKm) {
        const t = (targetKm - a.distKm) / (b.distKm - a.distKm)
        return {
          lat: a.lat + t * (b.lat - a.lat),
          lng: a.lng + t * (b.lng - a.lng),
        }
      }
    }

    // targetKm beyond route end — clamp to last waypoint
    const last = waypoints[waypoints.length - 1]
    return { lat: last.lat, lng: last.lng }
  }

  /**
   * Get segment waypoints for bbox computation, verifying ownership via adventure join.
   * Returns null if segment not found OR does not belong to userId.
   */
  async getSegmentWaypoints(
    segmentId: string,
    userId: string,
  ): Promise<Array<{ lat: number; lng: number; distKm: number }> | null> {
    const rows = await db
      .select({
        waypoints: adventureSegments.waypoints,
      })
      .from(adventureSegments)
      .innerJoin(adventures, eq(adventureSegments.adventureId, adventures.id))
      .where(
        and(
          eq(adventureSegments.id, segmentId),
          eq(adventures.userId, userId),
        ),
      )
      .limit(1)

    if (rows.length === 0 || !rows[0].waypoints) return null
    // Waypoints stored as snake_case in JSONB — normalize to camelCase
    const raw = rows[0].waypoints as Array<{ lat: number; lng: number; dist_km?: number; distKm?: number }>
    return raw.map((wp) => ({
      lat: wp.lat,
      lng: wp.lng,
      distKm: wp.distKm ?? wp.dist_km ?? 0,
    }))
  }
}
