/** Overpass API cache TTL in seconds (24 hours) */
export const OVERPASS_CACHE_TTL = 24 * 60 * 60

/** POI bbox cache TTL in seconds (30 days — Overpass OSM + Google Places data is stable; avoids redundant calls to both APIs) */
export const POI_BBOX_CACHE_TTL = 30 * 24 * 60 * 60

/** Google Places cache TTL in seconds (7 days — place_ids and details are stable) */
export const GOOGLE_PLACES_CACHE_TTL = 7 * 24 * 60 * 60

/** WeatherAPI.com cache TTL in seconds (1 hour per waypoint) */
export const WEATHER_CACHE_TTL = 60 * 60

/** Geoapify cache TTL in seconds (7 days — stable geocoding data) */
export const GEOAPIFY_CACHE_TTL = 7 * 24 * 60 * 60

/** Job status polling interval in ms (TanStack Query refetchInterval) */
export const JOB_POLL_INTERVAL_MS = 3000

/** Max adventure segments per adventure (free tier) */
export const MAX_SEGMENTS_FREE = 3

/** Max adventures per user (free tier) */
export const MAX_ADVENTURES_FREE = 2
