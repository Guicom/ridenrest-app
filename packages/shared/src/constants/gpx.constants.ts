/** Maximum number of GPX track points after RDP simplification */
export const MAX_GPX_POINTS = 2000

/** RDP epsilon in km — 0.0001 ≈ 10m deviation threshold */
export const RDP_EPSILON = 0.0001

/** Corridor width for PostGIS ST_Buffer in meters (500m each side) */
export const CORRIDOR_WIDTH_M = 500

/** Maximum km range for a single POI corridor search */
export const MAX_SEARCH_RANGE_KM = 30

/** Maximum GPX file size in bytes (10MB) */
export const MAX_GPX_FILE_SIZE_BYTES = 10 * 1024 * 1024
