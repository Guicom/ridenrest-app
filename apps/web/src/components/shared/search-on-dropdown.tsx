'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { buildBookingSearchUrl, buildBookingCoordUrl, buildAirbnbSearchUrl } from '@/lib/booking-url'
import { trackBookingClick } from '@/lib/analytics'
import type { UserTier } from '@/lib/analytics'
import { useProfile } from '@/hooks/use-profile'
import { useSession } from '@/lib/auth/client'

interface SearchOnDropdownProps {
  /** Waypoint center for the search area. null = disabled (no URL to open). */
  center: { lat: number; lng: number } | null
  /** City name for Booking.com search. If provided, uses ?ss=city instead of coordinates. */
  city?: string | null
  /** Postal code appended to city in Booking.com ?ss= param for disambiguation. */
  postcode?: string | null
  /**
   * 'outline' — planning sidebar style (border, text, rounded-lg)
   * 'action'  — live controls action row style (rounded-full, bg-primary)
   */
  variant?: 'outline' | 'action'
  className?: string
  /** Current page context for analytics */
  page?: 'map' | 'live'
  /** POI type for analytics (e.g. 'hotel', 'hostel', 'camp_site') */
  poiType?: string
}

export function SearchOnDropdown({ center, city, postcode, variant = 'outline', className, page = 'map', poiType }: SearchOnDropdownProps) {
  const { data: session } = useSession()
  const { data: profile } = useProfile(!!session)
  const userTier: UserTier = session ? (profile?.tier ?? 'free') : 'anonymous'
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleMouseDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [open])

  const bookingUrl = city
    ? buildBookingSearchUrl(city, postcode)
    : center
      ? buildBookingCoordUrl(center)
      : null
  const airbnbUrl = center ? buildAirbnbSearchUrl(center) : null

  const triggerClass =
    variant === 'action'
      ? [
          'flex w-full h-11 items-center justify-center gap-1.5 rounded-full text-sm font-medium transition-all duration-75',
          center
            ? 'bg-primary text-primary-foreground hover:brightness-90 active:scale-[0.97] cursor-pointer'
            : 'bg-primary/40 text-primary-foreground/60 cursor-not-allowed',
        ].join(' ')
      : [
          'flex w-full items-center justify-center gap-1.5 py-2 rounded-lg border border-[--border]',
          'text-sm font-medium text-[--text-primary] transition-all duration-75',
          center
            ? 'hover:bg-[--surface] active:scale-[0.98] cursor-pointer'
            : 'opacity-40 cursor-not-allowed',
        ].join(' ')

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        disabled={!center}
        onClick={() => setOpen((v) => !v)}
        data-testid="search-on-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Rechercher sur Booking.com ou Airbnb"
        className={triggerClass}
      >
        <span className="truncate">
          {variant === 'action' ? 'RECHERCHER SUR' : 'Rechercher sur'}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && center && (
        <div
          role="menu"
          data-testid="search-on-menu"
          className="absolute bottom-full mb-1.5 left-0 right-0 z-50 flex flex-col gap-2 rounded-xl border border-[--border] bg-background p-2 shadow-lg"
        >
          {bookingUrl && (
            <a
              href={bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              data-testid="search-on-booking"
              onClick={() => {
                trackBookingClick({ source: 'booking.com', poi_type: poiType ?? 'none', page, user_tier: userTier })
                setOpen(false)
              }}
              className="flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-white bg-[#003580] hover:bg-[#00296b] active:scale-[0.98] transition-all duration-75 cursor-pointer"
            >
              Rechercher sur Booking.com
            </a>
          )}
          <a
            href={airbnbUrl!}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            data-testid="search-on-airbnb"
            onClick={() => {
              trackBookingClick({ source: 'airbnb', poi_type: poiType ?? 'none', page, user_tier: userTier })
              setOpen(false)
            }}
            className="flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-white bg-[#FF5A5F] hover:bg-[#e0484d] active:scale-[0.98] transition-all duration-75 cursor-pointer"
          >
            Rechercher sur Airbnb
          </a>
        </div>
      )}
    </div>
  )
}
