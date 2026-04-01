'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { listStravaRoutes, importStravaRoute } from '@/lib/api-client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import type { StravaRouteItem } from '@/lib/api-client'

interface StravaImportModalProps {
  adventureId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  stravaConnected: boolean  // from profile.stravaAthleteId !== null
}

export function StravaImportModal({
  adventureId,
  open,
  onOpenChange,
  stravaConnected,
}: StravaImportModalProps) {
  const queryClient = useQueryClient()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')

  // Reset search and selection when modal closes
  useEffect(() => {
    if (!open) {
      setSearchQuery('')
      setSelectedIds(new Set())
    }
  }, [open])

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending, isError, error } =
    useInfiniteQuery({
      queryKey: ['strava-routes'],
      queryFn: ({ pageParam }: { pageParam: number }) => listStravaRoutes(pageParam),
      initialPageParam: 1,
      getNextPageParam: (lastPage: StravaRouteItem[], allPages: StravaRouteItem[][]) =>
        lastPage.length === 30 ? allPages.length + 1 : undefined,
      enabled: open && stravaConnected,
      staleTime: 0,
    })

  const allRoutes: StravaRouteItem[] = data?.pages.flat() ?? []

  const filteredRoutes = allRoutes.filter((r) =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  function toggleSelection(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const importMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        await importStravaRoute(id, adventureId)
      }
    },
    onSuccess: (_, ids) => {
      void queryClient.invalidateQueries({ queryKey: ['adventures', adventureId, 'segments'] })
      toast.success(`${ids.length} segment(s) importé(s)`)
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(`Erreur lors de l'importation : ${err.message}`),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importer depuis Strava</DialogTitle>
          <DialogDescription>
            Sélectionne une ou plusieurs routes Strava pour les importer comme segments GPX.
          </DialogDescription>
        </DialogHeader>

        {!stravaConnected ? (
          <div className="py-4 space-y-3 text-sm text-muted-foreground">
            <p>Connecte ton compte Strava dans les paramètres pour importer des routes.</p>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              <Link href="/settings">Aller dans les paramètres</Link>
            </Button>
          </div>
        ) : isPending ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : isError ? (
          <p className="py-4 text-sm text-destructive">
            Erreur lors du chargement des routes Strava.{' '}
            {(error as { message?: string })?.message ?? ''}
          </p>
        ) : !allRoutes.length ? (
          <p className="py-4 text-sm text-muted-foreground">
            Aucune route Strava trouvée. Crée des routes dans Strava pour les importer ici.
          </p>
        ) : (
          <>
            <Input
              placeholder="Rechercher une route..."
              aria-label="Rechercher une route"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="mb-2"
            />
            {filteredRoutes.length === 0 && searchQuery ? (
              <p className="py-4 text-sm text-muted-foreground">
                Aucune route trouvée pour &laquo;{searchQuery}&raquo;.
              </p>
            ) : (
              <div className="space-y-1 py-2 max-h-80 overflow-y-auto">
                {filteredRoutes.map((route) => (
                  <div
                    key={route.id}
                    className="flex items-start gap-3 py-2 px-1 rounded cursor-pointer hover:bg-muted/50"
                    onClick={() => toggleSelection(route.id)}
                  >
                    <Checkbox
                      checked={selectedIds.has(route.id)}
                      onCheckedChange={() => toggleSelection(route.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-0.5 shrink-0"
                      aria-label={`Sélectionner ${route.name}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{route.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {route.distanceKm.toFixed(1)} km
                        {route.elevationGainM != null ? ` · ${Math.round(route.elevationGainM)}m D+` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {hasNextPage && (
              <Button
                variant="outline"
                className="w-full mt-2"
                onClick={() => void fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? 'Chargement…' : 'Charger plus'}
              </Button>
            )}
          </>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
          <p className="text-xs text-muted-foreground order-2 sm:order-1">
            {selectedIds.size > 0 ? `${selectedIds.size} sélectionné(s)` : 'Aucun segment sélectionné'}
          </p>
          <div className="flex gap-2 order-1 sm:order-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importMutation.isPending}>
              Annuler
            </Button>
            <Button
              onClick={() => importMutation.mutate([...selectedIds])}
              disabled={selectedIds.size === 0 || importMutation.isPending}
            >
              {importMutation.isPending
                ? 'Importation…'
                : `Importer ${selectedIds.size > 0 ? selectedIds.size : ''} segment(s)`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
