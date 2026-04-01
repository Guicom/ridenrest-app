// Auth tables (Better Auth)
export * from './schema/auth'

// Enums
export { tierEnum, unitPrefEnum, currencyEnum } from './schema/profiles'
export { adventureStatusEnum, densityStatusEnum } from './schema/adventures'
export { parseStatusEnum } from './schema/adventure-segments'
export { gapSeverityEnum } from './schema/coverage-gaps'

// Tables
export { profiles } from './schema/profiles'
export { adventures } from './schema/adventures'
export { adventureSegments } from './schema/adventure-segments'
export { adventureStages } from './schema/adventure-stages'
export { accommodationsCache } from './schema/accommodations-cache'
export { weatherCache } from './schema/weather-cache'
export { coverageGaps } from './schema/coverage-gaps'
export { feedbacks } from './schema/feedbacks'

// Database instances
export { db } from './db'
export { authDb } from './auth-db' // Serverless-safe pool (max:2) for Next.js / Better Auth

// Inferred types (use these throughout apps — never redefine)
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm'
import type { adventures } from './schema/adventures'
import type { adventureSegments } from './schema/adventure-segments'
import type { adventureStages } from './schema/adventure-stages'
import type { profiles } from './schema/profiles'
import type { accommodationsCache } from './schema/accommodations-cache'
import type { weatherCache } from './schema/weather-cache'
import type { coverageGaps } from './schema/coverage-gaps'

export type Adventure = InferSelectModel<typeof adventures>
export type NewAdventure = InferInsertModel<typeof adventures>
export type AdventureSegment = InferSelectModel<typeof adventureSegments>
export type NewAdventureSegment = InferInsertModel<typeof adventureSegments>
export type AdventureStage = InferSelectModel<typeof adventureStages>
export type NewAdventureStage = InferInsertModel<typeof adventureStages>
export type Profile = InferSelectModel<typeof profiles>
export type AccommodationCache = InferSelectModel<typeof accommodationsCache>
export type WeatherCache = InferSelectModel<typeof weatherCache>
export type CoverageGap = InferSelectModel<typeof coverageGaps>
