/**
 * Plausible custom event helpers.
 * Uses window.plausible directly so it works both inside and outside React components.
 * In dev (no Plausible script loaded), calls are no-ops.
 */

export type UserTier = 'free' | 'pro' | 'team' | 'anonymous'

export interface BookingClickProps {
  source: 'booking.com' | 'airbnb'
  poi_type: string
  page: 'map' | 'live'
  user_tier: UserTier
}

declare global {
  interface Window {
    plausible?: (event: string, options?: { props: Record<string, string> }) => void
  }
}

export function trackBookingClick(props: BookingClickProps): void {
  const p: Record<string, string> = { ...props }
  window.plausible?.('booking_click', { props: p })
}

// ── Funnel event helpers (Story 15.3) ──────────────────────────────────────

export function hashAdventureId(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36).slice(0, 8)
}

export function trackGpxUploaded(props: { segment_count: number; total_km: number }): void {
  window.plausible?.('gpx_uploaded', {
    props: {
      segment_count: String(props.segment_count),
      total_km: String(Math.round(props.total_km)),
    },
  })
}

export function trackMapOpened(props: { adventure_id_hash: string }): void {
  window.plausible?.('map_opened', { props })
}

export function trackPoiSearchTriggered(props: {
  mode: 'planning' | 'live'
  poi_categories: string[]
  result_count: number
}): void {
  window.plausible?.('poi_search_triggered', {
    props: {
      mode: props.mode,
      poi_categories: props.poi_categories.join(','),
      result_count: String(props.result_count),
    },
  })
}

export function trackPoiDetailOpened(props: { poi_type: string; source: 'overpass' | 'google' }): void {
  window.plausible?.('poi_detail_opened', { props })
}
