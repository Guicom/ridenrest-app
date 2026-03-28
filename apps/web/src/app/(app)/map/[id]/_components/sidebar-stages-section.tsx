'use client'
import { useState } from 'react'
import { Pencil, Trash2, MapPin, X, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { STAGE_COLORS } from '@ridenrest/shared'
import type { AdventureStageResponse, CreateStageInput, UpdateStageInput } from '@ridenrest/shared'
import type { MapWaypoint } from '@ridenrest/shared'

interface SidebarStagesSectionProps {
  stages: AdventureStageResponse[]
  allCumulativeWaypoints: MapWaypoint[]
  onEnterClickMode: () => void
  onExitClickMode: () => void
  isClickModeActive: boolean
  pendingEndKm: number | null
  showNamingDialog: boolean
  onNamingDialogClose: () => void
  stagesVisible: boolean
  onStagesVisibilityChange: (visible: boolean) => void
  onCreateStage: (data: CreateStageInput) => Promise<void>
  onUpdateStage: (stageId: string, data: UpdateStageInput) => Promise<void>
  onDeleteStage: (stageId: string) => Promise<void>
}

export function SidebarStagesSection({
  stages,
  onEnterClickMode,
  onExitClickMode,
  isClickModeActive,
  pendingEndKm,
  showNamingDialog,
  onNamingDialogClose,
  stagesVisible,
  onStagesVisibilityChange,
  onCreateStage: createStage,
  onUpdateStage: updateStage,
  onDeleteStage: deleteStage,
}: SidebarStagesSectionProps) {

  const [expanded, setExpanded] = useState(false)

  // State for naming dialog (called after a map click)
  const [namingInput, setNamingInput] = useState('')

  // State for edit dialog
  const [editStage, setEditStage] = useState<AdventureStageResponse | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')

  // State for delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<AdventureStageResponse | null>(null)

  // When naming dialog opens, pre-fill default name
  const handleNamingDialogOpenChange = (open: boolean) => {
    if (open) {
      setNamingInput(`Étape ${stages.length + 1}`)
    } else {
      onNamingDialogClose()
    }
  }

  const autoColor = STAGE_COLORS[stages.length % STAGE_COLORS.length]

  const handleNamingConfirm = async () => {
    if (pendingEndKm === null) return
    const name = namingInput.trim() || `Étape ${stages.length + 1}`
    await createStage({ name, endKm: pendingEndKm, color: autoColor })
    onNamingDialogClose()
    onExitClickMode()
  }

  const handleEditOpen = (stage: AdventureStageResponse) => {
    setEditStage(stage)
    setEditName(stage.name)
    setEditColor(stage.color)
  }

  const handleEditSave = async () => {
    if (!editStage) return
    await updateStage(editStage.id, { name: editName, color: editColor })
    setEditStage(null)
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    await deleteStage(deleteTarget.id)
    setDeleteTarget(null)
  }

  return (
    <div className="rounded-xl border border-[--border] overflow-hidden">
      {/* Section header — full row clickable, chevron right (matches density/weather pattern) */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
        data-testid="stages-section-header"
      >
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5" aria-hidden="true" />
          <span className="text-sm font-medium">Étapes</span>
        </div>
        <span className="text-muted-foreground" aria-hidden="true">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </div>

      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-3">
          {/* Switch afficher sur la carte */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Afficher sur la carte</span>
            <Switch
              checked={stagesVisible}
              onCheckedChange={onStagesVisibilityChange}
              aria-label="Afficher les étapes"
              data-testid="stages-visibility-toggle"
            />
          </div>

          {/* CTA ajouter / annuler */}
          {isClickModeActive ? (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => { e.stopPropagation(); onExitClickMode() }}
              className="w-full h-8 text-xs"
              data-testid="cancel-click-mode"
            >
              <X className="h-3 w-3 mr-1" />
              Annuler le placement
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => { e.stopPropagation(); onEnterClickMode() }}
              className="w-full h-8 text-xs"
              data-testid="add-stage-btn"
            >
              + Ajouter une étape
            </Button>
          )}

          {/* Stage list */}
          {stages.length > 0 && (
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
              {stages.map((stage) => (
                <div
                  key={stage.id}
                  className="flex items-center gap-2 rounded-md border border-[--border] p-2"
                  data-testid={`stage-item-${stage.id}`}
                >
                  <div
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: stage.color }}
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate text-sm font-medium">{stage.name}</span>
                  <span className="text-xs text-muted-foreground">{stage.distanceKm.toFixed(1)} km</span>
                  <span className="text-xs text-muted-foreground">D+ —</span>
                  <span className="text-xs text-muted-foreground">— min</span>
                  <button
                    onClick={() => handleEditOpen(stage)}
                    aria-label={`Modifier ${stage.name}`}
                    className="text-muted-foreground hover:text-foreground"
                    data-testid={`edit-stage-${stage.id}`}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(stage)}
                    aria-label={`Supprimer ${stage.name}`}
                    className="text-muted-foreground hover:text-destructive"
                    data-testid={`delete-stage-${stage.id}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Naming dialog (after map click) */}
      <Dialog open={showNamingDialog} onOpenChange={handleNamingDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nommer l'étape</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="stage-name">Nom</Label>
              <Input
                id="stage-name"
                value={namingInput}
                onChange={(e) => setNamingInput(e.target.value)}
                placeholder={`Étape ${stages.length + 1}`}
                autoFocus
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Couleur auto :</span>
              <div
                className="h-5 w-5 rounded-full border-2 border-white shadow"
                style={{ backgroundColor: autoColor }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onNamingDialogClose}>Annuler</Button>
            <Button onClick={handleNamingConfirm}>Sauvegarder</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editStage} onOpenChange={(open) => !open && setEditStage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier l'étape</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-stage-name">Nom</Label>
              <Input
                id="edit-stage-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                data-testid="edit-stage-name-input"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Couleur</Label>
              <div className="flex gap-2 flex-wrap">
                {STAGE_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setEditColor(c)}
                    className={`h-6 w-6 rounded-full border-2 transition-transform ${
                      editColor === c ? 'border-foreground scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Couleur ${c}`}
                    data-testid={`color-swatch-${c}`}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditStage(null)}>Annuler</Button>
            <Button onClick={handleEditSave}>Sauvegarder</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l'étape ?</AlertDialogTitle>
            <AlertDialogDescription>
              Supprimer l'étape &laquo;{deleteTarget?.name}&raquo; ? Les étapes suivantes seront recalculées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
