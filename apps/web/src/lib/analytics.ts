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
  window.plausible?.('booking_click', { props: props as Record<string, string> })
}
