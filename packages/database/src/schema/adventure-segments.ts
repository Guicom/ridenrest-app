import { pgTable, text, timestamp, real, integer, jsonb, pgEnum, customType, index } from 'drizzle-orm/pg-core'
import { adventures } from './adventures'

export const parseStatusEnum = pgEnum('parse_status', ['pending', 'processing', 'done', 'error'])

// PostGIS LINESTRING — Drizzle doesn't support PostGIS natively; use customType
const geometry = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geometry(LINESTRING, 4326)'
  },
})

export const adventureSegments = pgTable('adventure_segments', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  adventureId: text('adventure_id').notNull().references(() => adventures.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  orderIndex: integer('order_index').notNull(),
  cumulativeStartKm: real('cumulative_start_km').notNull().default(0),
  distanceKm: real('distance_km').notNull().default(0),
  elevationGainM: real('elevation_gain_m'),
  elevationLossM: real('elevation_loss_m'),
  storageUrl: text('storage_url'),
  source: text('source'),  // null = manual upload, 'strava' = Strava route import
  parseStatus: parseStatusEnum('parse_status').notNull().default('pending'),
  geom: geometry('geom'),
  waypoints: jsonb('waypoints'),
  boundingBox: jsonb('bounding_box'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdateFn(() => new Date()),
}, (table) => ({
  adventureIdIdx: index('idx_adventure_segments_adventure_id').on(table.adventureId),
  orderIdx: index('idx_adventure_segments_order').on(table.adventureId, table.orderIndex),
}))
