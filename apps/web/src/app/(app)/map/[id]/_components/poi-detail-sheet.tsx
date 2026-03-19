'use client'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useUIStore } from '@/stores/ui.store'
import { useMapStore } from '@/stores/map.store'
import { usePoiGoogleDetails } from '@/hooks/use-poi-google-details'
import { computeElevationGain } from '@ridenrest/gpx'
import { LAYER_CATEGORIES, DEFAULT_CYCLING_SPEED_KMH } from '@ridenrest/shared'
import { trackBookingClick } from '@/lib/api-client'
import type { Poi, MapLayer } from '@ridenrest/shared'
import type { MapSegmentData } from '@/lib/api-client'

const LAYER_ICONS: Record<MapLayer, string> = {
  accommodations: '🏨',
  restaurants:    '🍽️',
  supplies:       '🛒',
  bike:           '🚲',
}

const ACCOMMODATION_CATEGORIES = LAYER_CATEGORIES.accommodations


interface PoiDetailSheetProps {
  poi: Poi | null
  segments: MapSegmentData[]
  segmentId: string | null
  /** Live mode context — overrides planning mode fromKm / speed */
  liveContext?: {
    currentKmOnRoute: number
    speedKmh: number
  }
}

export function PoiDetailSheet({ poi, segments, segmentId, liveContext }: PoiDetailSheetProps) {
  const { selectedPoiId, setSelectedPoi } = useUIStore()
  const { fromKm } = useMapStore()
  const isOpen = !!selectedPoiId && !!poi
  const isLiveMode = !!liveContext

  const { details, isPending: detailsPending } = usePoiGoogleDetails(
    poi?.externalId ?? null,
    segmentId,
  )

  if (!poi) return null

  // ── D+ and ETA computation ────────────────────────────────────────────────
  const layer = (Object.entries(LAYER_CATEGORIES).find(([, cats]) =>
    cats.includes(poi.category),
  )?.[0] ?? 'accommodations') as MapLayer

  const poiKm = poi.distAlongRouteKm
  const startKm = isLiveMode ? liveContext.currentKmOnRoute : fromKm
  const speed = isLiveMode ? liveContext.speedKmh : DEFAULT_CYCLING_SPEED_KMH

  // Find waypoints between startKm and poiKm across all segments
  const rangeWaypoints = segments.flatMap((seg) => {
    const segStart = seg.cumulativeStartKm
    const localFrom = Math.max(0, startKm - segStart)
    const localTo = Math.min(seg.distanceKm, poiKm - segStart)
    if (localTo <= localFrom || !seg.waypoints) return []
    return seg.waypoints
      .filter((wp) => wp.distKm >= localFrom && wp.distKm <= localTo)
      .map((wp) => ({ lat: wp.lat, lng: wp.lng, elevM: wp.ele ?? undefined }))
  })

  const elevationGainM = rangeWaypoints.length > 1
    ? Math.round(computeElevationGain(rangeWaypoints))
    : null

  const distanceKm = Math.max(0, poiKm - startKm)
  const etaMin = Math.round((distanceKm / speed) * 60)

  // ── OSM fallback data ─────────────────────────────────────────────────────
  const rawData = (poi as Poi & { rawData?: Record<string, string> }).rawData
  const osmPhone = rawData?.phone ?? rawData?.['contact:phone'] ?? null
  const osmWebsite = rawData?.website ?? rawData?.['contact:website'] ?? null

  const displayPhone = details?.phone ?? osmPhone
  const displayWebsite = details?.website ?? osmWebsite

  // ── Booking deep links ────────────────────────────────────────────────────
  const isAccommodation = ACCOMMODATION_CATEGORIES.includes(poi.category)

  const bookingUrl = `https://www.booking.com/searchresults.html?latitude=${poi.lat}&longitude=${poi.lng}`
  const hotelsUrl  = `https://www.hotels.com/search.do?q-destination=${poi.lat}%2C${poi.lng}`

  const handleBookingClick = (platform: 'booking_com' | 'hotels_com') => {
    // Fire-and-forget analytics — do NOT await
    trackBookingClick(poi.externalId, platform)
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) setSelectedPoi(null) }}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[70vh] overflow-y-auto">
        <SheetHeader className="text-left pb-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden="true">{LAYER_ICONS[layer]}</span>
            <SheetTitle className="text-base font-semibold leading-tight">
              {poi.name}
            </SheetTitle>
          </div>
        </SheetHeader>

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 gap-2 py-3 border-y border-zinc-100 dark:border-zinc-800">
          <StatItem label="Sur la trace" value={`km ${poiKm.toFixed(1)}`} />
          {isLiveMode && poi.distFromTargetM != null ? (
            <StatItem
              label="Distance cible"
              value={
                poi.distFromTargetM < 1000
                  ? `${poi.distFromTargetM} m`
                  : `${(poi.distFromTargetM / 1000).toFixed(1)} km`
              }
            />
          ) : (
            <StatItem
              label="Distance trace"
              value={
                poi.distFromTraceM < 1000
                  ? `${Math.round(poi.distFromTraceM)} m`
                  : `${(poi.distFromTraceM / 1000).toFixed(1)} km`
              }
            />
          )}
          {elevationGainM !== null && elevationGainM > 0 && (
            <StatItem label="D+" value={`↑ ${elevationGainM} m`} />
          )}
          <StatItem
            label="Temps estimé"
            value={formatEta(distanceKm, speed)}
            hint={`(à ${speed} km/h)`}
          />
        </div>

        {/* ── Google enrichment (progressive) ── */}
        {detailsPending ? (
          <div className="py-3 space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-36" />
          </div>
        ) : details ? (
          <div className="py-3 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
            {details.rating !== null && (
              <p>⭐ {details.rating.toFixed(1)} / 5</p>
            )}
            {details.isOpenNow !== null && (
              <p className={details.isOpenNow ? 'text-green-600' : 'text-red-500'}>
                {details.isOpenNow ? '✓ Ouvert maintenant' : '✗ Fermé'}
              </p>
            )}
            {details.formattedAddress && (
              <p className="text-xs">{details.formattedAddress}</p>
            )}
          </div>
        ) : null}

        {/* ── Contact ── */}
        {(displayPhone || displayWebsite) && (
          <div className="py-2 space-y-1 text-sm">
            {displayPhone && (
              <a href={`tel:${displayPhone}`} className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                <span aria-hidden="true">📞</span> {displayPhone}
              </a>
            )}
            {displayWebsite && (
              <a
                href={displayWebsite}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-blue-600 dark:text-blue-400 text-xs truncate"
              >
                <span aria-hidden="true">🌐</span> {displayWebsite}
              </a>
            )}
          </div>
        )}

        {/* ── Booking deep links (accommodations only) ── */}
        {isAccommodation && (
          <div className="pt-3 space-y-2">
            <p className="text-[10px] text-zinc-400 text-right">Lien partenaire</p>
            <a
              href={bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => handleBookingClick('booking_com')}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
            >
              Rechercher sur Booking.com
            </a>
            <a
              href={hotelsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => handleBookingClick('hotels_com')}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-600 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Rechercher sur Hotels.com
            </a>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatEta(distanceKm: number, speedKmh: number): string {
  if (speedKmh <= 0) return '—'
  const totalMinutes = Math.round((distanceKm / speedKmh) * 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return h > 0 ? `~${h}h${String(m).padStart(2, '0')}` : `~${m} min`
}

function StatItem({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-[10px] text-zinc-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
        {value}
        {hint && <span className="text-xs font-normal text-zinc-400 ml-1">{hint}</span>}
      </p>
    </div>
  )
}
