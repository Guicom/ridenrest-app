import { pgTable, text, timestamp, real, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { adventureSegments } from './adventure-segments'

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
  cachedAt: timestamp('cached_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
}, (table) => ({
  // Composite replaces the separate segment_id index (leftmost prefix covers segment-only queries)
  segmentExpiresIdx: index('idx_accommodations_cache_segment_expires').on(table.segmentId, table.expiresAt),
  // Keep expires_at alone for TTL cleanup queries scanning all expired rows globally
  expiresAtIdx: index('idx_accommodations_cache_expires_at').on(table.expiresAt),
  // Prevent duplicate POI records on cache refresh
  uniquePoiPerSegment: uniqueIndex('uq_accommodations_cache_segment_external_source').on(table.segmentId, table.externalId, table.source),
}))
