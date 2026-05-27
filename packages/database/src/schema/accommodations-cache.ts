import { pgTable, text, timestamp, real, jsonb, index, uniqueIndex, boolean } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { adventureSegments } from './adventure-segments'
import { adventureStages } from './adventure-stages'
import { lineString } from '../types/geometry'

export const accommodationsCache = pgTable('accommodations_cache', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  segmentId: text('segment_id').notNull().references(() => adventureSegments.id, { onDelete: 'cascade' }),
  externalId: text('external_id').notNull(),
  source: text('source').notNull(),
  category: text('category').notNull(),
  name: text('name').notNull(),
  lat: real('lat').notNull(),
  lng: real('lng').notNull(),
  distFromTraceM: real('dist_from_trace_m').notNull(),
  distAlongRouteKm: real('dist_along_route_km').notNull(),
  rawData: jsonb('raw_data'),
  accessOriginStageId: text('access_origin_stage_id')
    .references(() => adventureStages.id, { onDelete: 'set null' }),
  accessDistanceM: real('access_distance_m'),
  accessElevationGainM: real('access_elevation_gain_m'),
  accessElevationLossM: real('access_elevation_loss_m'),
  accessGeometry: lineString('access_geometry'),
  accessEngineVersion: text('access_engine_version'),
  accessComputedAt: timestamp('access_computed_at'),
  accessFailed: boolean('access_failed').notNull().default(false),
  cachedAt: timestamp('cached_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
}, (table) => ({
  // Composite replaces the separate segment_id index (leftmost prefix covers segment-only queries)
  segmentExpiresIdx: index('idx_accommodations_cache_segment_expires').on(table.segmentId, table.expiresAt),
  // Keep expires_at alone for TTL cleanup queries scanning all expired rows globally
  expiresAtIdx: index('idx_accommodations_cache_expires_at').on(table.expiresAt),
  // Prevent duplicate POI records on cache refresh
  uniquePoiPerSegment: uniqueIndex('uq_accommodations_cache_segment_external_source').on(table.segmentId, table.externalId, table.source),
  accessStageIdx: index('idx_accommodations_cache_access_stage').on(table.accessOriginStageId),
  accessPendingIdx: index('idx_accommodations_cache_access_pending')
    .on(table.segmentId)
    .where(sql`access_computed_at IS NULL AND access_failed = false`),
}))
