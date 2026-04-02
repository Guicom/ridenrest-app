'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { X, ExternalLink, Globe } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { usePoiGoogleDetails } from '@/hooks/use-poi-google-details'
import { computeElevationGain } from '@ridenrest/gpx'
import { LAYER_CATEGORIES, DEFAULT_CYCLING_SPEED_KMH } from '@ridenrest/shared'
import { trackBookingClick } from '@/lib/api-client'
import type { Poi, MapLayer, PoiCategory } from '@ridenrest/shared'
import type { MapSegmentData } from '@/lib/api-client'
import type maplibregl from 'maplibre-gl'

const LAYER_LABELS: Record<MapLayer, string> = {
  accommodations: 'Hébergement',
  restaurants:    'Restauration',
  supplies:       'Alimentation',
  bike:           'Vélo / Réparation',
}

const ACCOMMODATION_CATEGORIES = LAYER_CATEGORIES.accommodations

// Accommodation type chips — shown in popup for accommodations
// bookingFilter: nflt value for Booking.com property type filter (null = no filter)
const ACCOMMODATION_TYPES: Array<{
  category: PoiCategory
  label: string
  emoji: string
  bookingFilter: string | null
}> = [
  { category: 'hotel',      label: 'Hôtel',   emoji: '🏨', bookingFilter: 'ht_id%3D204' },
  { category: 'hostel',     label: 'Auberge', emoji: '🛏️', bookingFilter: 'ht_id%3D203' },
  { category: 'guesthouse', label: 'Gîte',    emoji: '🏠', bookingFilter: 'ht_id%3D220' },
  { category: 'camp_site',  label: 'Camping', emoji: '🏕️', bookingFilter: null },
  { category: 'shelter',    label: 'Refuge',  emoji: '🏔️', bookingFilter: null },
]

// Pin height in pixels — popup is anchored this far above the pin center
const PIN_OFFSET_PX = 44

interface PoiPopupProps {
  poi: Poi
  segments: MapSegmentData[]
  segmentId: string | null
  map: maplibregl.Map
  onClose: () => void
  liveContext?: {
    currentKmOnRoute: number
    speedKmh: number
  }
}

interface ScreenPos {
  x: number
  y: number
}

export function PoiPopup({ poi, segments, segmentId, map, onClose, liveContext }: PoiPopupProps) {
  const [pos, setPos] = useState<ScreenPos | null>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const isLiveMode = !!liveContext

  // Stable ref so map click handler never needs to re-register on onClose identity changes
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Accommodation type selector — default to POI's own category
  const [selectedCategory, setSelectedCategory] = useState<PoiCategory>(poi.category)

  const { details, isPending: detailsPending } = usePoiGoogleDetails(
    poi.externalId,
    segmentId,
  )

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
  // MapLibre only fires 'click' when there's no drag — no extra drag detection needed
  useEffect(() => {
    const handleMapClick = (e: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point)
      // Don't close if the click landed on a POI individual pin (layer IDs end with '-points')
      const clickedOnPin = features.some(
        (f) => f.layer.id.endsWith('-points') && !f.properties?.point_count
      )
      if (!clickedOnPin) onCloseRef.current()
    }
    map.on('click', handleMapClick)
    return () => { map.off('click', handleMapClick) }
  }, [map])

  // Reset type selection when POI changes
  useEffect(() => {
    setSelectedCategory(poi.category)
  }, [poi.category])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!pos) return null

  // ── Computations ──────────────────────────────────────────────────────────
  const layer = (Object.entries(LAYER_CATEGORIES).find(([, cats]) =>
    cats.includes(poi.category),
  )?.[0] ?? 'accommodations') as MapLayer

  const poiKm = poi.distAlongRouteKm
  const fromKm = isLiveMode ? liveContext.currentKmOnRoute : 0
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

  const rawData = (poi as Poi & { rawData?: Record<string, string> }).rawData
  const osmPhone = rawData?.phone ?? rawData?.['contact:phone'] ?? null
  const osmWebsite = rawData?.website ?? rawData?.['contact:website'] ?? null
  const displayPhone = details?.phone ?? osmPhone
  const displayWebsite = details?.website ?? osmWebsite

  const isAccommodation = ACCOMMODATION_CATEGORIES.includes(poi.category)

  // Booking URL — includes nflt filter for the selected accommodation type
  const selectedType = ACCOMMODATION_TYPES.find(t => t.category === selectedCategory)
  const nflt = selectedType?.bookingFilter
  const bookingUrl = `https://www.booking.com/searchresults.html?latitude=${poi.lat}&longitude=${poi.lng}${nflt ? `&nflt=${nflt}` : ''}`

  const handleBookingClick = () => {
    trackBookingClick(poi.externalId, 'booking_com')
  }

  const distanceLabel = poi.distFromTraceM < 1000
    ? `${Math.round(poi.distFromTraceM)} m de la trace`
    : `${(poi.distFromTraceM / 1000).toFixed(1)} km de la trace`

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 30 }}>
      <div
        ref={popupRef}
        className="pointer-events-auto absolute w-72 max-w-[calc(100vw-2rem)] [--popup-bg:#ffffff] dark:[--popup-bg:#18181b]"
        style={{
          left: pos.x,
          top: pos.y - PIN_OFFSET_PX,
          transform: 'translateX(-50%) translateY(-100%)',
        }}
      >
        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-[--border] overflow-hidden">

          {/* Header */}
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold leading-snug text-[--text-primary] truncate">
                  {poi.name}
                </h3>
                <span className="inline-block mt-1 bg-[--primary-light] text-[--primary] text-xs font-medium px-2 py-0.5 rounded-full">
                  {LAYER_LABELS[layer]}
                </span>
              </div>
              <button
                onClick={onClose}
                aria-label="Fermer"
                className="shrink-0 mt-0.5 h-6 w-6 flex items-center justify-center rounded-full hover:bg-[--surface] text-[--text-secondary]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mt-2 text-sm text-[--text-secondary]">{distanceLabel}</p>
          </div>

          {/* Stats row */}
          <div className="px-4 py-2 flex items-center gap-3 text-xs text-[--text-secondary] border-t border-[--border]">
            <span className="font-mono font-medium text-[--text-primary]">km {poiKm.toFixed(1)}</span>
            {elevationGainM !== null && elevationGainM > 0 && (
              <span>↑ {elevationGainM} m</span>
            )}
            <span>{formatEta(distanceKm, speed)}</span>
          </div>

          {/* Google enrichment */}
          {detailsPending ? (
            <div className="px-4 py-2 flex gap-2 border-t border-[--border]">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-24" />
            </div>
          ) : details ? (
            <div className="px-4 py-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs border-t border-[--border]">
              {details.isOpenNow !== null && (
                <span className={details.isOpenNow ? 'text-green-600' : 'text-red-500'}>
                  {details.isOpenNow ? '✓ Ouvert' : '✗ Fermé'}
                </span>
              )}
              {details.formattedAddress && (
                <span className="text-[--text-secondary] truncate max-w-full">{details.formattedAddress}</span>
              )}
            </div>
          ) : null}

          {/* Phone */}
          {displayPhone && (
            <div className="px-4 py-1">
              <a href={`tel:${displayPhone}`} className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                <span aria-hidden="true">📞</span> {displayPhone}
              </a>
            </div>
          )}

          {/* Accommodation: type selector + CTAs */}
          {isAccommodation && (
            <div className="px-4 pb-4 pt-3 border-t border-[--border] flex flex-col gap-3">

              {/* Type chips */}
              <div>
                <p className="text-[10px] text-[--text-secondary] uppercase tracking-wide mb-1.5">
                  Type d&apos;hébergement
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {ACCOMMODATION_TYPES.map((type) => (
                    <button
                      key={type.category}
                      onClick={() => setSelectedCategory(type.category)}
                      aria-pressed={selectedCategory === type.category}
                      className={[
                        'flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                        selectedCategory === type.category
                          ? 'bg-[--primary] text-white border-[--primary]'
                          : 'bg-white text-[--text-primary] border-[--border] hover:bg-[--surface]',
                      ].join(' ')}
                    >
                      <span aria-hidden="true">{type.emoji}</span>
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Booking CTA */}
              <a
                href={bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleBookingClick}
                aria-label="Recherche sur Booking.com"
                className="flex items-center justify-center gap-2 w-full h-11 rounded-full bg-[--primary] text-white text-sm font-medium hover:opacity-90"
              >
                <ExternalLink className="h-4 w-4" />
                Recherche sur Booking
              </a>

              {/* Site officiel */}
              {displayWebsite && (
                <a
                  href={displayWebsite}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Site officiel de l'établissement"
                  className="flex items-center justify-center gap-2 w-full h-11 rounded-full border border-[--border] text-[--text-primary] text-sm font-medium hover:bg-[--surface]"
                >
                  <Globe className="h-4 w-4" />
                  Site officiel
                </a>
              )}
            </div>
          )}

          {/* Non-accommodation: website only */}
          {!isAccommodation && displayWebsite && (
            <div className="px-4 pb-4 pt-1">
              <a
                href={displayWebsite}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 dark:text-blue-400 truncate block"
              >
                🌐 {displayWebsite}
              </a>
            </div>
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
