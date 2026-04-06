'use client'
import { Drawer } from 'vaul'
import { Globe } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useUIStore } from '@/stores/ui.store'
import { useMapStore } from '@/stores/map.store'
import { usePoiGoogleDetails } from '@/hooks/use-poi-google-details'
import { computeElevationGain } from '@ridenrest/gpx'
import { LAYER_CATEGORIES, DEFAULT_CYCLING_SPEED_KMH } from '@ridenrest/shared'
import { extractCityFromOsmRawData } from '@/lib/booking-url'
import { useReverseCity } from '@/hooks/use-reverse-city'
import { SearchOnDropdown } from '@/components/shared/search-on-dropdown'
import type { Poi, MapLayer } from '@ridenrest/shared'
import type { MapSegmentData } from '@/lib/api-client'

const LAYER_ICONS: Record<MapLayer, string> = {
  accommodations: '🏨',
  restaurants:    '🍽️',
  supplies:       '🛒',
  bike:           '🚲',
}

const LAYER_LABELS: Record<MapLayer, string> = {
  accommodations: 'Hébergement',
  restaurants:    'Restauration',
  supplies:       'Alimentation',
  bike:           'Vélo / Réparation',
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

  // City + Postcode extraction — hooks must be called before early return (Rules of Hooks)
  const isAccommodation = poi ? ACCOMMODATION_CATEGORIES.includes(poi.category) : false
  const rawData = poi ? (poi as Poi & { rawData?: Record<string, string> }).rawData : undefined
  const osmData = isAccommodation ? extractCityFromOsmRawData(rawData) : null
  const extractedCity = isAccommodation
    ? (details?.locality ?? osmData?.city ?? null)
    : null
  const needsReverseCity = isAccommodation && !extractedCity && poi !== null
  const { city: reverseCity, postcode: reversePostcode } = useReverseCity(
    needsReverseCity ? { lat: poi!.lat, lng: poi!.lng } : null,
  )
  const poiCity = extractedCity ?? reverseCity
  const poiPostcode = isAccommodation
    ? (details?.postalCode ?? osmData?.postcode ?? reversePostcode)
    : null

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

  // ── OSM fallback data ─────────────────────────────────────────────────────
  const osmPhone = rawData?.phone ?? rawData?.['contact:phone'] ?? null
  const osmWebsite = rawData?.website ?? rawData?.['contact:website'] ?? null

  const displayPhone = details?.phone ?? osmPhone
  const displayWebsite = details?.website ?? osmWebsite

  return (
    <Drawer.Root
      open={isOpen}
      onOpenChange={(open) => { if (!open) { setSelectedPoi(null); useMapStore.getState().setSelectedPoiId(null) } }}
      snapPoints={[0.4, 0.85]}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-background rounded-t-2xl h-full max-h-[85vh] focus:outline-none">
          <Drawer.Title className="sr-only">{poi.name}</Drawer.Title>

          {/* Drag handle */}
          <div className="w-12 h-1.5 bg-[--border] rounded-full mx-auto mt-3 mb-2 shrink-0" />

          <div className="px-4 pb-8 overflow-y-auto flex-1">
            {/* ── Header: icon + name + type badge ── */}
            <div className="flex items-start gap-2 pb-3">
              <span className="text-2xl mt-0.5" aria-hidden="true">{LAYER_ICONS[layer]}</span>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold leading-tight">{poi.name}</h2>
                <span className="inline-block mt-1 bg-[--primary-light] text-[--primary] text-xs font-medium px-2 py-0.5 rounded-full">
                  {LAYER_LABELS[layer]}
                </span>
              </div>
            </div>

            {/* ── Stats ── */}
            <div className="grid grid-cols-2 gap-2 py-3 border-y border-zinc-100 dark:border-zinc-800">
              <StatItem label="Sur la trace" value={<span className="font-mono text-sm">{`km ${poiKm.toFixed(1)}`}</span>} />
              {isLiveMode && poi.distFromTargetM != null ? (
                <StatItem
                  label="Distance cible"
                  value={
                    <span className="text-sm text-[--text-secondary]">
                      {poi.distFromTargetM < 1000
                        ? `${poi.distFromTargetM} m`
                        : `${(poi.distFromTargetM / 1000).toFixed(1)} km`}
                    </span>
                  }
                />
              ) : (
                <StatItem
                  label="Distance trace"
                  value={
                    <span className="text-sm text-[--text-secondary]">
                      {poi.distFromTraceM < 1000
                        ? `${Math.round(poi.distFromTraceM)} m`
                        : `${(poi.distFromTraceM / 1000).toFixed(1)} km`}
                    </span>
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
            {(displayPhone || (!isAccommodation && displayWebsite)) && (
              <div className="py-2 space-y-1 text-sm">
                {displayPhone && (
                  <a href={`tel:${displayPhone}`} className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                    <span aria-hidden="true">📞</span> {displayPhone}
                  </a>
                )}
                {!isAccommodation && displayWebsite && (
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

            {/* ── Booking / Airbnb deep links (accommodations only) ── */}
            {isAccommodation && (
              <div className="pt-3 space-y-2">
                <SearchOnDropdown
                  center={{ lat: poi.lat, lng: poi.lng }}
                  city={poiCity}
                  postcode={poiPostcode}
                  variant="action"
                  className="w-full"
                  page={isLiveMode ? 'live' : 'map'}
                  poiType={poi.category}
                />
                {displayWebsite && (
                  <a
                    href={displayWebsite}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Site officiel de l'établissement"
                    className="flex items-center justify-center gap-2 w-full h-12 rounded-full border border-[--border] text-[--text-primary] text-sm font-medium hover:bg-[--surface]"
                  >
                    <Globe className="h-4 w-4" />
                    Site officiel
                  </a>
                )}
              </div>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
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

function StatItem({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div>
      <p className="text-[10px] text-zinc-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
        {typeof value === 'string' ? value : value}
        {hint && <span className="text-xs font-normal text-zinc-400 ml-1">{hint}</span>}
      </p>
    </div>
  )
}
