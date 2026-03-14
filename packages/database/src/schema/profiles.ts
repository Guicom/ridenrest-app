import { pgTable, text, timestamp, pgEnum } from 'drizzle-orm/pg-core'
import { user } from './auth'

export const tierEnum = pgEnum('tier', ['free', 'pro', 'team'])
export const unitPrefEnum = pgEnum('unit_pref', ['km', 'mi'])
export const currencyEnum = pgEnum('currency', ['EUR', 'USD', 'GBP'])

export const profiles = pgTable('profiles', {
  id: text('id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  tier: tierEnum('tier').notNull().default('free'),
  unitPref: unitPrefEnum('unit_pref').notNull().default('km'),
  currency: currencyEnum('currency').notNull().default('EUR'),
  stravaAthleteId: text('strava_athlete_id').unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdateFn(() => new Date()),
})
