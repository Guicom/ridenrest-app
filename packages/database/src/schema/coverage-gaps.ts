import { pgTable, text, timestamp, real, pgEnum, index } from 'drizzle-orm/pg-core'
import { adventureSegments } from './adventure-segments'

export const gapSeverityEnum = pgEnum('gap_severity', ['low', 'medium', 'critical'])

export const coverageGaps = pgTable('coverage_gaps', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  segmentId: text('segment_id').notNull().references(() => adventureSegments.id, { onDelete: 'cascade' }),
  fromKm: real('from_km').notNull(),
  toKm: real('to_km').notNull(),
  gapLengthKm: real('gap_length_km').notNull(),
  severity: gapSeverityEnum('severity').notNull(),
  analyzedAt: timestamp('analyzed_at').notNull().defaultNow(),
}, (table) => ({
  segmentIdIdx: index('idx_coverage_gaps_segment_id').on(table.segmentId),
}))
