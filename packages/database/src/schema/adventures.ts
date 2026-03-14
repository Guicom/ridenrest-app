import { pgTable, text, timestamp, real, pgEnum, index } from 'drizzle-orm/pg-core'
import { user } from './auth'

export const adventureStatusEnum = pgEnum('adventure_status', ['planning', 'active', 'completed'])

export const adventures = pgTable('adventures', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  totalDistanceKm: real('total_distance_km').notNull().default(0),
  status: adventureStatusEnum('status').notNull().default('planning'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdateFn(() => new Date()),
}, (table) => ({
  userIdIdx: index('idx_adventures_user_id').on(table.userId),
}))
