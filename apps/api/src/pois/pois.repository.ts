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
      source: r.source as 'overpass' | 'amadeus',
      category: r.category as Poi['category'],
      name: r.name,
      lat: r.lat,
      lng: r.lng,
      distFromTraceM: r.distFromTraceM,
      distAlongRouteKm: r.distAlongRouteKm,
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
          ST_LineLocatePoint(seg.geom, ST_ClosestPoint(seg.geom, ST_SetSRID(ST_MakePoint(ac.lng, ac.lat), 4326)))
          * seg.distance_km,
          2
        )
      FROM adventure_segments seg
      WHERE ac.segment_id = ${segmentId}
        AND seg.id = ${segmentId}
        AND ac.dist_from_trace_m = 0
        AND seg.geom IS NOT NULL
    `)
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
