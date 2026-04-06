'use client'
import { useState } from 'react'
import { ChevronDown, ChevronUp, LayoutGrid, Loader2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { useMapStore } from '@/stores/map.store'
import { SectionTooltip } from '@/components/shared/section-tooltip'
import { DensityCategoryDialog } from '@/app/(app)/adventures/[id]/_components/density-category-dialog'
import { triggerDensityAnalysis } from '@/lib/api-client'
import { useDensity } from '@/hooks/use-density'
import type { MapSegmentData } from '@ridenrest/shared'

function LegendItem({ color, label, detail }: { color: string; label: string; detail: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block h-3 w-3 rounded-full shrink-0"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <span className="text-xs font-medium">{label}</span>
      <span className="text-xs text-muted-foreground">— {detail}</span>
    </div>
  )
}

interface SidebarDensitySectionProps {
  adventureId: string
  segments: MapSegmentData[]
}

export function SidebarDensitySection({ adventureId, segments }: SidebarDensitySectionProps) {
  const [expanded, setExpanded] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const { densityColorEnabled, toggleDensityColor } = useMapStore()
  const { densityStatus, densityStale, densityProgress } = useDensity(adventureId)
  const queryClient = useQueryClient()

  const needsCalculation = densityStatus === 'idle' || densityStatus === 'error' || (densityStatus === 'success' && densityStale)
  const isAnalyzing = densityStatus === 'pending' || densityStatus === 'processing'
  const isDone = densityStatus === 'success' && !densityStale

  const allSegmentsParsed = segments.every((s) => s.parseStatus === 'done') && segments.length > 0

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

  return (
    <div className="rounded-xl border border-[--border] overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-[--surface-raised] active:bg-[--border] transition-colors"
        onClick={() => setExpanded((v) => !v)}
        data-testid="density-section-header"
      >
        <SectionTooltip content="Analyse la disponibilité des hébergements sur toute la trace. Les tronçons rouges indiquent les zones sans hébergement.">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5" aria-hidden="true" />
            <span className="text-sm font-medium">Densité</span>
          </div>
        </SectionTooltip>
        <span className="text-muted-foreground" aria-hidden="true">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </div>
      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-3">
          {/* CTA — density not calculated or stale */}
          {needsCalculation && (
            <>
              <p className="text-xs text-muted-foreground">
                {densityStatus === 'error'
                  ? "L'analyse a échoué. Réessayez."
                  : densityStale
                    ? 'Les segments ont changé depuis la dernière analyse. Relancez pour mettre à jour.'
                    : "Identifie les zones avec peu d'hébergements sur votre parcours."}
              </p>
              <Button
                variant="ghost"
                className="w-full gap-2 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
                onClick={(e) => { e.stopPropagation(); setDialogOpen(true) }}
                disabled={!allSegmentsParsed || triggerMutation.isPending}
                data-testid="density-cta-btn"
              >
                <LayoutGrid className="h-4 w-4" />
                {densityStatus === 'error' ? 'Réessayer' : 'Calculer la densité'}
              </Button>
            </>
          )}

          {/* Progress — analysis running */}
          {isAnalyzing && (
            <div className="flex items-center gap-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">
                  Analyse en cours… {densityProgress > 0 ? `${densityProgress}%` : ''}
                </p>
                {densityProgress > 0 && (
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${densityProgress}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Done — toggle + legend */}
          {isDone && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Afficher sur la carte</span>
                <Switch
                  checked={densityColorEnabled}
                  onCheckedChange={toggleDensityColor}
                  aria-label="Afficher la densité"
                  data-testid="density-toggle"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-medium text-[--text-secondary] uppercase tracking-wide mb-1">
                  Densité hébergements / 10 km
                </p>
                <LegendItem color="var(--density-high)"   label="Bonne disponibilité"   detail="2+ hébergements / 10km" />
                <LegendItem color="var(--density-medium)" label="Disponibilité limitée" detail="1 hébergement / 10km" />
                <LegendItem color="var(--density-low)"    label="Zone critique"          detail="Aucun hébergement / 10km" />
              </div>
            </>
          )}
        </div>
      )}
      <DensityCategoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConfirm={(cats) => triggerMutation.mutate(cats)}
        isLoading={triggerMutation.isPending}
      />
    </div>
  )
}
