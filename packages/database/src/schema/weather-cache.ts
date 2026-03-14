import { pgTable, text, timestamp, real, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { adventureSegments } from './adventure-segments'

export const weatherCache = pgTable('weather_cache', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  segmentId: text('segment_id').notNull().references(() => adventureSegments.id, { onDelete: 'cascade' }),
  waypointKm: real('waypoint_km').notNull(),
  forecastAt: timestamp('forecast_at').notNull(),
  temperatureC: real('temperature_c'),
  precipitationMm: real('precipitation_mm'),
  windSpeedKmh: real('wind_speed_kmh'),
  windDirection: real('wind_direction'),
  weatherCode: text('weather_code'),
  rawData: jsonb('raw_data'),
  cachedAt: timestamp('cached_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
}, (table) => ({
  segmentKmIdx: index('idx_weather_cache_segment_km').on(table.segmentId, table.waypointKm),
  // Prevent duplicate forecasts for the same (segment, waypoint, time)
  uniqueWeatherEntry: uniqueIndex('uq_weather_cache_segment_km_forecast').on(table.segmentId, table.waypointKm, table.forecastAt),
}))
