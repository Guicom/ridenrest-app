'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useParams } from 'next/navigation'
import { Menu } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Logo } from '@/components/ui/logo'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { getAdventure } from '@/lib/api-client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useSession } from '@/lib/auth/client'
import { FeedbackModal } from '@/components/shared/feedback-modal'

export function AppHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const params = useParams()
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const { data: session } = useSession()

  const isMapPage = pathname.startsWith('/map/')
  const adventureId = isMapPage ? (params.id as string) : null

  // useQuery must be called unconditionally (Rules of Hooks) — disabled when not on a map page
  const { data: adventure, isPending } = useQuery({
    queryKey: ['adventures', adventureId],
    queryFn: () => getAdventure(adventureId!),
    enabled: Boolean(adventureId),
  })

  // Live mode is full-screen immersive — hide header entirely (AC #6)
  if (pathname.startsWith('/live/')) return null

  const isAdventuresActive =
    pathname === '/adventures' || pathname.startsWith('/adventures/')
  const isSettingsActive = pathname.startsWith('/settings')
  const isHelpActive = pathname === '/help'

  return (
    <>
    <header className="sticky top-0 z-50 h-14 bg-background border-b border-[--border] flex items-center px-4">
      <div className={cn('flex items-center w-full', !isMapPage && 'max-w-[1400px] mx-auto')}>
      {/* Left: Logo — icon-only on mobile, full logo on sm+ (AC #2, #8) */}
      <div className="flex-shrink-0">
        <Link href="/adventures" aria-label="Ride'n'Rest — Mes aventures">
          <Logo iconOnly className="h-8 w-auto sm:hidden" aria-hidden />
          <Logo className="h-8 w-auto hidden sm:block" aria-hidden />
        </Link>
      </div>

      {/* Center: Adventure name on map pages (AC #3) */}
      {isMapPage ? (
        <div className="flex-1 flex justify-center px-4">
          {isPending ? (
            <Skeleton className="h-5 w-40" />
          ) : adventure?.name ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-primary truncate max-w-xs">
                {adventure.name}
              </span>
              <Badge
                variant="outline"
                className="shrink-0 bg-blue-500/10 text-blue-600 border-blue-500/20 text-xs font-medium"
              >
                Planning
              </Badge>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* Right: Navigation (AC #4, #7, #8) */}
      <div className="flex-shrink-0">
        {/* Desktop nav — visible on sm+ (AC #9) */}
        <nav className="hidden sm:flex items-center gap-4">
          <Link
            href="/adventures"
            className={cn(
              'text-sm',
              isAdventuresActive
                ? 'text-text-primary font-medium'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            Mes aventures
          </Link>
          <Link
            href="/help"
            className={cn(
              'text-sm',
              isHelpActive
                ? 'text-text-primary font-medium'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            Aide
          </Link>
          <Link
            href="/settings"
            className={cn(
              'text-sm',
              isSettingsActive
                ? 'text-text-primary font-medium'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            Mon compte
          </Link>
          <button
            type="button"
            onClick={() => setFeedbackOpen(true)}
            className="text-sm text-text-secondary hover:text-text-primary"
          >
            Feedback
          </button>
        </nav>

        {/* Mobile hamburger — visible below sm (AC #8) */}
        <div className="sm:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger aria-label="Menu" className="p-2 rounded-md">
              <Menu className="h-5 w-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className={cn(
                  isAdventuresActive && 'text-text-primary font-medium',
                )}
                onClick={() => router.push('/adventures')}
              >
                Mes aventures
              </DropdownMenuItem>
              <DropdownMenuItem
                className={cn(
                  isHelpActive && 'text-text-primary font-medium',
                )}
                onClick={() => router.push('/help')}
              >
                Aide
              </DropdownMenuItem>
              <DropdownMenuItem
                className={cn(
                  isSettingsActive && 'text-text-primary font-medium',
                )}
                onClick={() => router.push('/settings')}
              >
                Mon compte
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setFeedbackOpen(true) }}>
                Feedback
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      </div>
    </header>
    <FeedbackModal
      open={feedbackOpen}
      onOpenChange={setFeedbackOpen}
      userEmail={session?.user?.email ?? ''}
    />
    </>
  )
}
