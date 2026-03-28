import { pgTable, text, timestamp, real, integer, index } from 'drizzle-orm/pg-core'
import { adventures } from './adventures'

export const adventureStages = pgTable('adventure_stages', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  adventureId: text('adventure_id').notNull().references(() => adventures.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').notNull(),          // hex string e.g. '#f97316'
  orderIndex: integer('order_index').notNull(),
  startKm: real('start_km').notNull(),
  endKm: real('end_km').notNull(),
  distanceKm: real('distance_km').notNull(), // = endKm - startKm (stored for easy listing)
  // elevationGainM and etaMinutes intentionally absent — computed in Story 11.3
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdateFn(() => new Date()),
}, (table) => ({
  adventureIdIdx: index('idx_adventure_stages_adventure_id').on(table.adventureId),
  orderIdx: index('idx_adventure_stages_order').on(table.adventureId, table.orderIndex),
}))
