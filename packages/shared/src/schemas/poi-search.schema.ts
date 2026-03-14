import { z } from 'zod'
import { MAX_SEARCH_RANGE_KM } from '../constants/gpx.constants'

export const poiSearchSchema = z.object({
  segmentId: z.string().uuid(),
  fromKm: z.number().min(0),
  toKm: z.number().min(0),
  categories: z.array(z.enum(['hotel', 'hostel', 'camp_site', 'shelter', 'restaurant', 'supermarket', 'convenience', 'bike_shop', 'bike_repair'])).optional(),
}).refine(
  (data) => data.toKm > data.fromKm,
  { message: 'toKm must be greater than fromKm', path: ['toKm'] }
).refine(
  (data) => (data.toKm - data.fromKm) <= MAX_SEARCH_RANGE_KM,
  { message: `Search range cannot exceed ${MAX_SEARCH_RANGE_KM} km`, path: ['toKm'] }
)

export type PoiSearchInput = z.infer<typeof poiSearchSchema>
