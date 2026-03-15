import { Injectable } from '@nestjs/common'
import { db, accommodationsCache, adventureSegments, adventures } from '@ridenrest/database'
import { eq, and, gte, sql, inArray } from 'drizzle-orm'
import type { OverpassNode } from './providers/overpass.provider.js'
import type { Poi } from '@ridenrest/shared'

@Injectable()
export class PoisRepository {
  /** Retrieve cached POIs for a segment from accommodations_cache, filtered by categories. */
  async findCachedPois(segmentId: string, categories: string[]): Promise<Poi[]> {
    const now = new Date()
    const rows = await db
      .select()
      .from(accommodationsCache)
      .where(
        and(
          eq(accommodationsCache.segmentId, segmentId),
          gte(accommodationsCache.expiresAt, now),
          inArray(accommodationsCache.category, categories),
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
