import { pgTable, text, timestamp, real, integer, pgEnum, index } from 'drizzle-orm/pg-core'
import { user } from './auth'

export const adventureStatusEnum = pgEnum('adventure_status', ['planning', 'active', 'completed'])
export const densityStatusEnum = pgEnum('density_status', ['idle', 'pending', 'processing', 'success', 'error'])

export const adventures = pgTable('adventures', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  totalDistanceKm: real('total_distance_km').notNull().default(0),
  totalElevationGainM: real('total_elevation_gain_m'),
  status: adventureStatusEnum('status').notNull().default('planning'),
  densityStatus: densityStatusEnum('density_status').notNull().default('idle'),
  densityProgress: integer('density_progress').notNull().default(0),
  densityCategories: text('density_categories').array().notNull().default([]),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdateFn(() => new Date()),
}, (table) => ({
  userIdIdx: index('idx_adventures_user_id').on(table.userId),
}))
