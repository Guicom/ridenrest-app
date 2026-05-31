import { customType } from 'drizzle-orm/pg-core'

export const lineString = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geometry(LINESTRING, 4326)'
  },
})

/**
 * Colonne PostGIS géométrie générique (`geometry(GEOMETRY, 4326)`) — accepte `LineString`
 * ET `MultiLineString`. Utilisée pour `access_geometry` : l'itinéraire d'accès calculé
 * (`computeDivergentSegment` + `ST_Difference`) est fréquemment multi-parties, et un type
 * `geometry(LINESTRING)` rejetait silencieusement ces écritures (« Geometry type
 * (MultiLineString) does not match column type (LineString) » → cache jamais persisté).
 */
export const lineOrMultiLineString = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geometry(GEOMETRY, 4326)'
  },
})
