'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { listStravaRoutes, importStravaRoute } from '@/lib/api-client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
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
  const [importingId, setImportingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Reset search when modal closes
  useEffect(() => {
    if (!open) setSearchQuery('')
  }, [open])

  const { data: routes, isPending, isError, error } = useQuery({
    queryKey: ['strava', 'routes'],
    queryFn: listStravaRoutes,
    staleTime: 0,  // always stale → refetch on every modal open
    enabled: stravaConnected && open,
    retry: false,
  })

  const filteredRoutes = routes?.filter((r) =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) ?? []

  const importMutation = useMutation({
    mutationFn: (stravaRouteId: string) => importStravaRoute(stravaRouteId, adventureId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adventures', adventureId, 'segments'] })
      onOpenChange(false)
      toast.success('Route Strava importée — analyse en cours')
    },
    onError: () => {
      toast.error("Erreur lors de l'import Strava")
    },
    onSettled: () => setImportingId(null),
  })

  function handleImport(route: StravaRouteItem) {
    setImportingId(route.id)
    importMutation.mutate(route.id)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importer depuis Strava</DialogTitle>
          <DialogDescription>
            Sélectionne une route Strava pour l&apos;importer comme segment GPX.
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
        ) : !routes?.length ? (
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
              <div className="space-y-2 py-2 max-h-80 overflow-y-auto">
                {filteredRoutes.map((route) => (
                  <div
                    key={route.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{route.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {route.distanceKm.toFixed(1)} km
                        {route.elevationGainM != null ? ` · ${Math.round(route.elevationGainM)}m D+` : ''}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleImport(route)}
                      disabled={importMutation.isPending}
                      className="ml-3 shrink-0"
                    >
                      {importMutation.isPending && importingId === route.id ? 'Import...' : 'Importer'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
