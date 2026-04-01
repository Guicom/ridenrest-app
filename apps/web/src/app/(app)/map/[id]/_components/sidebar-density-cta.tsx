'use client'
import { useState } from 'react'
import { LayoutGrid } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DensityCategoryDialog } from '@/app/(app)/adventures/[id]/_components/density-category-dialog'
import { triggerDensityAnalysis } from '@/lib/api-client'
import { useDensity } from '@/hooks/use-density'
import type { MapSegmentData } from '@ridenrest/shared'

interface Props {
  adventureId: string
  segments: MapSegmentData[]
}

export function SidebarDensityCta({ adventureId, segments }: Props) {
  const { densityStatus, densityStale } = useDensity(adventureId)
  const [dialogOpen, setDialogOpen] = useState(false)
  const queryClient = useQueryClient()

  const triggerMutation = useMutation({
    mutationFn: (categories: string[]) => triggerDensityAnalysis(adventureId, categories),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['density', adventureId] })
      toast.success('Analyse de densité démarrée')
      setDialogOpen(false)
    },
    onError: (err: Error & { status?: number }) => {
      toast.error(err.status === 409 ? 'Analyse déjà en cours' : "Erreur lors du lancement de l'analyse")
    },
  })

  const shouldShow = densityStatus === 'idle' || (densityStatus === 'success' && densityStale)
  if (!shouldShow) return null

  const allSegmentsParsed = segments.every((s) => s.parseStatus === 'done') && segments.length > 0

  return (
    <div className="rounded-xl border border-[--border] overflow-hidden">
      <div className="flex flex-col gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="text-sm font-medium">Analyse de densité</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {densityStale
            ? 'Les segments ont changé depuis la dernière analyse. Relancez pour mettre à jour.'
            : "Identifie les zones avec peu d'hébergements sur votre parcours."}
        </p>
        <Button
          variant="ghost"
          className="w-full gap-2 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
          onClick={() => setDialogOpen(true)}
          disabled={!allSegmentsParsed || triggerMutation.isPending}
          data-testid="sidebar-density-cta-btn"
        >
          <LayoutGrid className="h-4 w-4" />
          Lancer l&apos;analyse de densité
        </Button>
      </div>
      <DensityCategoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConfirm={(cats) => triggerMutation.mutate(cats)}
        isLoading={triggerMutation.isPending}
      />
    </div>
  )
}
