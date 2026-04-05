'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { X, Globe, Phone, Navigation, Milestone, TrendingUp, Clock, ChevronDown } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { usePoiGoogleDetails } from '@/hooks/use-poi-google-details'
import { computeElevationGain } from '@ridenrest/gpx'
import { LAYER_CATEGORIES, DEFAULT_CYCLING_SPEED_KMH, POI_CATEGORY_COLORS } from '@ridenrest/shared'
import { SearchOnDropdown } from '@/components/shared/search-on-dropdown'
import { extractCityFromOsmRawData } from '@/lib/booking-url'
import { useReverseCity } from '@/hooks/use-reverse-city'
import type { Poi, PoiCategory } from '@ridenrest/shared'
import type { OpeningPeriod } from '@ridenrest/shared'
import type { MapSegmentData } from '@/lib/api-client'
import type maplibregl from 'maplibre-gl'

const CATEGORY_LABELS: Record<PoiCategory, string> = {
  hotel:        'Hôtel',
  hostel:       'Auberge',
  camp_site:    'Camping',
  shelter:      'Refuge',
  guesthouse:   "Chambre d'hôte",
  restaurant:   'Restauration',
  supermarket:  'Alimentation',
  convenience:  'Alimentation',
  bike_shop:    'Vélo',
  bike_repair:  'Vélo',
}

const ACCOMMODATION_CATEGORIES = LAYER_CATEGORIES.accommodations

// Pin height in pixels — popup is anchored this far above the pin center
const PIN_OFFSET_PX = 44

interface PoiPopupProps {
  poi: Poi
  segments: MapSegmentData[]
  segmentId: string | null
  map: maplibregl.Map
  onClose: () => void
  /** Live mode: GPS position + speed */
  liveContext?: {
    currentKmOnRoute: number
    speedKmh: number
  }
  /**
   * Planning mode reference km — start of the current stage (or 0 if no stage selected).
   * Stats (km, D+, ETA) are computed relative to this position.
   */
  planningFromKm?: number
}

interface ScreenPos {
  x: number
  y: number
}

function getNextTransition(
  isOpenNow: boolean | null,
  periods: OpeningPeriod[],
): string | null {
  if (isOpenNow === null || periods.length === 0) return null

  const now = new Date()
  const currentDay = now.getDay()   // 0=dimanche
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  const DAY_NAMES_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']

  if (isOpenNow) {
    const previousDay = (currentDay + 6) % 7  // day before currentDay (JS: 0=dimanche)
    const closing = periods.find(p => {
      // Period started today and already started
      if (p.open.day === currentDay && p.open.hour * 60 + p.open.minute <= currentMinutes) return true
      // Cross-midnight: period opened yesterday and closes today
      if (p.open.day === previousDay && p.close?.day === currentDay) return true
      return false
    })
    if (!closing?.close) return null  // 24/7 places have no close field
    const h = String(closing.close.hour).padStart(2, '0')
    const m = String(closing.close.minute).padStart(2, '0')
    return `Ferme à ${h}:${m}`
  } else {
    const allOpens = [...periods].sort((a, b) =>
      a.open.day * 1440 + a.open.hour * 60 + a.open.minute
      - (b.open.day * 1440 + b.open.hour * 60 + b.open.minute)
    )
    const next = allOpens.find(p =>
      p.open.day > currentDay ||
      (p.open.day === currentDay && p.open.hour * 60 + p.open.minute > currentMinutes)
    ) ?? allOpens[0]  // wrap to next week
    if (!next) return null
    const h = String(next.open.hour).padStart(2, '0')
    const m = String(next.open.minute).padStart(2, '0')
    const dayLabel = next.open.day !== currentDay ? ` ${DAY_NAMES_SHORT[next.open.day]}` : ''
    return `Ouvre à ${h}:${m}${dayLabel}`
  }
}

export function PoiPopup({ poi, segments, segmentId, map, onClose, liveContext, planningFromKm = 0 }: PoiPopupProps) {
  const [pos, setPos] = useState<ScreenPos | null>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const isLiveMode = !!liveContext
  const isAccommodation = ACCOMMODATION_CATEGORIES.includes(poi.category)

  // Stable ref so map click handler never needs to re-register on onClose identity changes
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const [hoursExpanded, setHoursExpanded] = useState(false)

  const { details, isPending: detailsPending } = usePoiGoogleDetails(
    poi.externalId,
    segmentId,
  )

  // City + Postcode: Google Places (primary) → OSM rawData (Overpass POIs) → Geoapify reverse geocoding
  const rawData = (poi as Poi & { rawData?: Record<string, string> }).rawData
  const osmData = isAccommodation ? extractCityFromOsmRawData(rawData) : null
  const extractedCity = isAccommodation
    ? (details?.locality ?? osmData?.city ?? null)
    : null
  const needsReverseCity = isAccommodation && !extractedCity
  const { city: reverseCity, postcode: reversePostcode } = useReverseCity(needsReverseCity ? { lat: poi.lat, lng: poi.lng } : null)
  const poiCity = extractedCity ?? reverseCity
  const poiPostcode = isAccommodation
    ? (details?.postalCode ?? osmData?.postcode ?? reversePostcode)
    : null



  // Project lat/lng → screen pixels (relative to map container)
  const project = useCallback(() => {
    const p = map.project([poi.lng, poi.lat])
    setPos({ x: Math.round(p.x), y: Math.round(p.y) })
  }, [map, poi.lng, poi.lat])

  useEffect(() => {
    project()
    map.on('move', project)
    map.on('zoom', project)
    return () => {
      map.off('move', project)
      map.off('zoom', project)
    }
  }, [project, map])

  // Close when clicking on the map background (not on a POI pin or cluster)
  useEffect(() => {
    const handleMapClick = (e: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point)
      const clickedOnPin = features.some(
        (f) => f.layer.id.endsWith('-points') && !f.properties?.point_count
      )
      if (!clickedOnPin) onCloseRef.current()
    }
    map.on('click', handleMapClick)
    return () => { map.off('click', handleMapClick) }
  }, [map])

  // Reset hours state when POI changes (use externalId — category alone doesn't detect same-category switch)
  useEffect(() => {
    setHoursExpanded(false)
  }, [poi.externalId])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!pos) return null

  // ── Computations ──────────────────────────────────────────────────────────
  const poiKm = poi.distAlongRouteKm
  const fromKm = isLiveMode ? liveContext.currentKmOnRoute : planningFromKm
  const speed = isLiveMode ? liveContext.speedKmh : DEFAULT_CYCLING_SPEED_KMH

  const rangeWaypoints = segments.flatMap((seg) => {
    const segStart = seg.cumulativeStartKm
    const localFrom = Math.max(0, fromKm - segStart)
    const localTo = Math.min(seg.distanceKm, poiKm - segStart)
    if (localTo <= localFrom || !seg.waypoints) return []
    return seg.waypoints
      .filter((wp) => wp.distKm >= localFrom && wp.distKm <= localTo)
      .map((wp) => ({ lat: wp.lat, lng: wp.lng, elevM: wp.ele ?? undefined }))
  })

  const elevationGainM = rangeWaypoints.length > 1
    ? Math.round(computeElevationGain(rangeWaypoints))
    : null

  const distanceKm = Math.max(0, poiKm - fromKm)

  const osmPhone = rawData?.phone ?? rawData?.['contact:phone'] ?? null
  const osmWebsite = rawData?.website ?? rawData?.['contact:website'] ?? null
  const displayPhone = details?.phone ?? osmPhone
  const displayWebsite = details?.website ?? osmWebsite
  const displayName = details?.displayName ?? poi.name

  const distanceLabel = poi.distFromTraceM < 1000
    ? `${Math.round(poi.distFromTraceM)} m de la trace`
    : `${(poi.distFromTraceM / 1000).toFixed(1)} km de la trace`

  // Tailwind v4 : utiliser les utility classes du design system, pas bg-[--var]
  const iconBtnClass = 'shrink-0 h-8 w-8 flex items-center justify-center rounded-full bg-primary-light text-primary hover:brightness-95 active:scale-[0.85] transition-all duration-75'

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 40 }}>
      <div
        ref={popupRef}
        className="pointer-events-auto absolute w-72 max-w-[calc(100vw-2rem)] [--popup-bg:#ffffff] dark:[--popup-bg:#18181b]"
        style={{
          left: pos.x,
          top: pos.y - PIN_OFFSET_PX,
          transform: 'translateX(-50%) translateY(-100%)',
        }}
      >
        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-[--border]">

          {/* Header */}
          <div className="px-4 pt-4 pb-3">

            {/* Row 1 : Badge catégorie + bouton Fermer */}
            <div className="flex items-center justify-between mb-2.5">
              <span
                className="inline-block text-xs font-bold uppercase tracking-wide px-2.5 py-0.5 rounded-full text-white"
                style={{ backgroundColor: POI_CATEGORY_COLORS[poi.category] }}
              >
                {CATEGORY_LABELS[poi.category]}
              </span>
              <button
                onClick={onClose}
                aria-label="Fermer"
                className="shrink-0 h-7 w-7 flex items-center justify-center rounded-full hover:bg-[--surface] active:scale-[0.85] transition-all duration-75 text-[--text-secondary] cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Row 2 : Nom + icône Navigation (adjacent) | icône Téléphone (droite) */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <h3 className="text-base font-semibold leading-snug text-[--text-primary] truncate">
                  {displayName}
                </h3>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${poi.lat},${poi.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Naviguer vers ${displayName}`}
                  className={iconBtnClass}
                >
                  <Navigation className="h-4 w-4" />
                </a>
              </div>
              {displayPhone && (
                <a
                  href={`tel:${displayPhone}`}
                  aria-label={`Appeler ${displayName}`}
                  className={iconBtnClass}
                >
                  <Phone className="h-4 w-4" />
                </a>
              )}
            </div>

            {/* Row 3 : Distance de la trace */}
            <p className="mt-1.5 text-sm text-[--text-secondary]">{distanceLabel}</p>
          </div>

          {/* Séparateur */}
          <div className="mx-4 h-px bg-[--border]" />

          {/* Stats row avec icônes */}
          <div className={`px-4 py-3 grid gap-2 text-center ${elevationGainM ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <div className="flex flex-col items-center gap-0.5">
              <Milestone className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-[--text-primary]">{distanceKm.toFixed(1)} km</span>
            </div>
            {elevationGainM !== null && elevationGainM > 0 && (
              <div className="flex flex-col items-center gap-0.5">
                <TrendingUp className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium text-[--text-primary]">{elevationGainM} m D+</span>
              </div>
            )}
            {distanceKm > 0 && speed > 0 && (
              <div className="flex flex-col items-center gap-0.5">
                <Clock className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium text-[--text-primary]">{formatEta(distanceKm, speed)}</span>
              </div>
            )}
          </div>

          {/* Skeleton pendant chargement Google */}
          {detailsPending && (
            <>
              <div className="mx-4 h-px bg-[--border]" />
              <div className="px-4 py-2 flex gap-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-24" />
              </div>
            </>
          )}

          {/* Section horaires repliables — non-hébergement uniquement */}
          {!isAccommodation && details && details.isOpenNow !== null && (
            <>
              <div className="mx-4 h-px bg-[--border]" />
              <button
                onClick={() => (details.weekdayDescriptions?.length ?? 0) > 0 && setHoursExpanded(v => !v)}
                className={[
                  'w-full px-4 py-2 flex items-center gap-1.5 text-xs text-left',
                  (details.weekdayDescriptions?.length ?? 0) > 0 ? 'cursor-pointer hover:bg-[--surface]' : 'cursor-default',
                ].join(' ')}
              >
                <span className={details.isOpenNow ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
                  {details.isOpenNow ? 'Ouvert' : 'Fermé'}
                </span>
                {(() => {
                  const next = getNextTransition(details.isOpenNow, details.periods ?? [])
                  return next ? <span className="text-[--text-secondary]">· {next}</span> : null
                })()}
                {(details.weekdayDescriptions?.length ?? 0) > 0 && (
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-[--text-secondary] ml-auto transition-transform duration-150 ${hoursExpanded ? 'rotate-180' : ''}`}
                  />
                )}
              </button>
              {hoursExpanded && (details.weekdayDescriptions?.length ?? 0) > 0 && (
                <div className="px-4 pb-2 space-y-0.5">
                  {details.weekdayDescriptions!.map((line, i) => {
                    const todayIndex = (new Date().getDay() + 6) % 7  // 0=lundi
                    return (
                      <p key={i} className={`text-xs ${i === todayIndex ? 'font-semibold text-[--text-primary]' : 'text-[--text-secondary]'}`}>
                        {line}
                      </p>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* CTAs — hébergement : Rechercher sur (Booking/Airbnb) + Site officiel (optionnel) */}
          {isAccommodation && (
            <>
              <div className="mx-4 h-px bg-[--border]" />
              <div className="px-4 py-3 flex flex-col gap-2">
                <SearchOnDropdown
                  center={{ lat: poi.lat, lng: poi.lng }}
                  city={poiCity}
                  postcode={poiPostcode}
                  variant="action"
                  className="w-full"
                />
                {displayWebsite && (
                  <a
                    href={displayWebsite}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Site officiel"
                    className="flex items-center justify-center gap-1.5 w-full h-11 rounded-full border border-[--border] text-[--text-primary] text-sm font-medium hover:bg-[--surface] active:scale-[0.98] transition-all duration-75"
                  >
                    <Globe className="h-4 w-4" />
                    Site officiel
                  </a>
                )}
              </div>
            </>
          )}

          {/* CTA — non-hébergement : Site officiel pleine largeur */}
          {!isAccommodation && displayWebsite && (
            <>
              <div className="mx-4 h-px bg-[--border]" />
              <div className="px-4 py-3">
                <a
                  href={displayWebsite}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 w-full h-11 rounded-full border border-[--border] text-[--text-primary] text-sm font-medium hover:bg-[--surface] active:scale-[0.98] transition-all duration-75"
                >
                  <Globe className="h-4 w-4" />
                  Site officiel
                </a>
              </div>
            </>
          )}
        </div>

        {/* Triangle pointer */}
        <div
          className="mx-auto w-0 h-0"
          style={{
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderTop: '8px solid var(--border)',
          }}
        />
        <div
          className="mx-auto w-0 h-0 -mt-[7px]"
          style={{
            borderLeft: '7px solid transparent',
            borderRight: '7px solid transparent',
            borderTop: '7px solid var(--popup-bg, white)',
          }}
        />
      </div>
    </div>
  )
}

function formatEta(distanceKm: number, speedKmh: number): string {
  if (speedKmh <= 0 || distanceKm <= 0) return '—'
  const totalMinutes = Math.round((distanceKm / speedKmh) * 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return h > 0 ? `~${h}h${String(m).padStart(2, '0')}` : `~${m} min`
}
