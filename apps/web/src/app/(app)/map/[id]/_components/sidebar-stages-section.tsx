'use client'
import { useState } from 'react'
import { MapPin, X, ChevronDown, ChevronUp } from 'lucide-react'
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
import { SectionTooltip } from '@/components/shared/section-tooltip'
import { OfflineTooltipWrapper } from '@/components/shared/offline-tooltip-wrapper'
import { StageCard } from '@/components/shared/stage-card'

/** Converts ISO 8601 string to datetime-local input value (YYYY-MM-DDTHH:mm) */
function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}


interface SidebarStagesSectionProps {
  stages: AdventureStageResponse[]
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
  weatherActive?: boolean
  stagesHaveDepartures?: boolean
  departureTime?: string
  speedKmh?: number
  defaultSpeedKmh?: number
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
  weatherActive = false,
  stagesHaveDepartures = false,
  departureTime,
  speedKmh,
  defaultSpeedKmh = 15,
}: SidebarStagesSectionProps) {

  const [expanded, setExpanded] = useState(false)

  // State for naming dialog (called after a map click)
  const [namingInput, setNamingInput] = useState('')
  const [namingDepartureTime, setNamingDepartureTime] = useState('')
  const [namingSpeedKmh, setNamingSpeedKmh] = useState<string>(String(defaultSpeedKmh))
  const [namingPauseHours, setNamingPauseHours] = useState<string>('0')

  // State for edit dialog
  const [editStage, setEditStage] = useState<AdventureStageResponse | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editDepartureTime, setEditDepartureTime] = useState('')
  const [editSpeedKmh, setEditSpeedKmh] = useState<string>('')
  const [editPauseHours, setEditPauseHours] = useState<string>('0')

  // State for delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<AdventureStageResponse | null>(null)

  // When naming dialog opens, pre-fill default name and reset fields
  const handleNamingDialogOpenChange = (open: boolean) => {
    if (open) {
      setNamingInput(`Étape ${stages.length + 1}`)
      setNamingDepartureTime('')
      setNamingSpeedKmh(String(defaultSpeedKmh))
      setNamingPauseHours('0')
    } else {
      onNamingDialogClose()
    }
  }

  const autoColor = STAGE_COLORS[stages.length % STAGE_COLORS.length]

  const handleNamingConfirm = async () => {
    if (pendingEndKm === null) return
    const name = namingInput.trim() || `Étape ${stages.length + 1}`
    const speed = parseFloat(namingSpeedKmh)
    const pause = parseFloat(namingPauseHours)
    await createStage({
      name,
      endKm: pendingEndKm,
      color: autoColor,
      departureTime: namingDepartureTime ? new Date(namingDepartureTime).toISOString() : null,
      speedKmh: !isNaN(speed) && speed !== defaultSpeedKmh ? speed : null,
      pauseHours: !isNaN(pause) && pause > 0 ? pause : null,
    })
    onNamingDialogClose()
    onExitClickMode()
  }

  const handleEditOpen = (stage: AdventureStageResponse) => {
    setEditStage(stage)
    setEditName(stage.name)
    setEditColor(stage.color)
    setEditDepartureTime(stage.departureTime ? isoToDatetimeLocal(stage.departureTime) : '')
    setEditSpeedKmh(stage.speedKmh != null ? String(stage.speedKmh) : String(defaultSpeedKmh))
    setEditPauseHours(stage.pauseHours != null ? String(stage.pauseHours) : '0')
  }

  const handleEditSave = async () => {
    if (!editStage) return
    const speed = parseFloat(editSpeedKmh)
    const pause = parseFloat(editPauseHours)
    await updateStage(editStage.id, {
      name: editName,
      color: editColor,
      departureTime: editDepartureTime ? new Date(editDepartureTime).toISOString() : null,
      speedKmh: !isNaN(speed) && speed !== defaultSpeedKmh ? speed : null,
      pauseHours: !isNaN(pause) && pause > 0 ? pause : null,
    })
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
        <SectionTooltip content="Créez des étapes journalières sur votre trace. Cliquez sur la trace ou utilisez le profil d'élévation pour placer la fin de chaque étape.">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5" aria-hidden="true" />
            <span className="text-sm font-medium">Étapes</span>
          </div>
        </SectionTooltip>
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
            <OfflineTooltipWrapper>
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => { e.stopPropagation(); onEnterClickMode() }}
                className="w-full h-8 text-xs"
                data-testid="add-stage-btn"
              >
                + Ajouter une étape
              </Button>
            </OfflineTooltipWrapper>
          )}

          {/* Stage list */}
          {stages.length > 0 && (
            <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
              {stages.map((stage) => (
                <StageCard
                  key={stage.id}
                  stage={stage}
                  mode="planning"
                  weatherActive={weatherActive}
                  stagesHaveDepartures={stagesHaveDepartures}
                  departureTime={departureTime}
                  speedKmh={speedKmh}
                  onEdit={handleEditOpen}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Naming dialog (after map click) */}
      <Dialog open={showNamingDialog} onOpenChange={handleNamingDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{"Nommer l'étape"}</DialogTitle>
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
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="stage-departure">Date de début</Label>
              <Input
                id="stage-departure"
                type="datetime-local"
                value={namingDepartureTime}
                onChange={(e) => setNamingDepartureTime(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="stage-speed">Vitesse moyenne (km/h)</Label>
              <Input
                id="stage-speed"
                type="number"
                min={5}
                max={50}
                value={namingSpeedKmh}
                onChange={(e) => setNamingSpeedKmh(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="stage-pause">Temps de pause (heures)</Label>
              <Input
                id="stage-pause"
                type="number"
                min={0}
                max={12}
                step={0.5}
                value={namingPauseHours}
                onChange={(e) => setNamingPauseHours(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={onNamingDialogClose}>Annuler</Button>
            <OfflineTooltipWrapper>
              <Button size="lg" onClick={handleNamingConfirm}>Sauvegarder</Button>
            </OfflineTooltipWrapper>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editStage} onOpenChange={(open) => !open && setEditStage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{"Modifier l'étape"}</DialogTitle>
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
                    className={`h-6 w-6 rounded-full border-2 transition-all duration-75 cursor-pointer hover:scale-110 active:scale-95 ${
                      editColor === c ? 'border-foreground scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Couleur ${c}`}
                    data-testid={`color-swatch-${c}`}
                  />
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-stage-departure">Date de début</Label>
              <Input
                id="edit-stage-departure"
                type="datetime-local"
                value={editDepartureTime}
                onChange={(e) => setEditDepartureTime(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-stage-speed">Vitesse moyenne (km/h)</Label>
              <Input
                id="edit-stage-speed"
                type="number"
                min={5}
                max={50}
                value={editSpeedKmh}
                onChange={(e) => setEditSpeedKmh(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-stage-pause">Temps de pause (heures)</Label>
              <Input
                id="edit-stage-pause"
                type="number"
                min={0}
                max={12}
                step={0.5}
                value={editPauseHours}
                onChange={(e) => setEditPauseHours(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={() => setEditStage(null)}>Annuler</Button>
            <OfflineTooltipWrapper>
              <Button size="lg" onClick={handleEditSave}>Sauvegarder</Button>
            </OfflineTooltipWrapper>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{"Supprimer l'étape ?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {"Supprimer l'étape"} &laquo;{deleteTarget?.name}&raquo; ? Les étapes suivantes seront recalculées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="lg">Annuler</AlertDialogCancel>
            <OfflineTooltipWrapper>
              <AlertDialogAction size="lg" onClick={handleDeleteConfirm}>Supprimer</AlertDialogAction>
            </OfflineTooltipWrapper>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
