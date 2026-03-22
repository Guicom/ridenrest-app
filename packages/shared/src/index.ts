// Types
export type { AdventureResponse, AdventureSegmentResponse, AdventureStatus, ParseStatus, DensityStatus, DensityStatusResponse, CoverageGapSummary, MapWaypoint, MapSegmentData, AdventureMapResponse, DensityAccommodationCategory } from './types/adventure.types'
export { DENSITY_ACCOMMODATION_CATEGORIES } from './types/adventure.types'
export type { Poi, PoiCategory, PoiSearchResponse, MapLayer } from './types/poi.types'
export { LAYER_CATEGORIES, CATEGORY_TO_LAYER } from './types/poi.types'
export type { WeatherForecast, WeatherPoint } from './types/weather.types'
export type { UserProfile, Tier, UnitPref, Currency } from './types/user.types'
export type { GooglePlaceDetails } from './types/google-place.types'

// Zod schemas
export { createAdventureSchema, updateAdventureSchema, reorderSegmentsSchema } from './schemas/adventure.schema'
export type { CreateAdventureInput, UpdateAdventureInput, ReorderSegmentsInput } from './schemas/adventure.schema'

export { createSegmentSchema, replaceSegmentSchema } from './schemas/segment.schema'
export type { CreateSegmentInput, ReplaceSegmentInput } from './schemas/segment.schema'

export { poiSearchSchema } from './schemas/poi-search.schema'
export type { PoiSearchInput } from './schemas/poi-search.schema'

// Constants
export * from './constants/gpx.constants'
export * from './constants/api.constants'
export * from './constants/weather.constants'
