import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core'

export const feedbacks = pgTable('feedbacks', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  category: text('category').notNull(),
  screen: text('screen'),
  description: text('description').notNull(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('idx_feedbacks_user_id').on(table.userId),
  createdAtIdx: index('idx_feedbacks_created_at').on(table.createdAt),
}))
