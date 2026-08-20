'use client'
import { useEffect, useMemo, useState } from 'react'
import { Loader2, Sparkles, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import {
  DEFAULT_DEPARTURE_HOUR,
  DEFAULT_TARGET_KM_PER_DAY,
  MIN_TARGET_KM_PER_DAY,
  MAX_TARGET_KM_PER_DAY,
  STAGE_GEN_MIN_ACCOMMODATIONS,
  STAGE_GEN_MAX_OFFSET_KM,
} from '@ridenrest/shared'
import type {
  AdventureStageResponse,
  GenerateStagesInput,
  PoiCategory,
  StageGenerationWarning,
} from '@ridenrest/shared'
import { ACCOMMODATION_SUB_TYPES } from './accommodation-sub-types'

/** Types d'hébergement absents de Google Places — ils ne vivent que dans OSM. */
const OSM_ONLY_CATEGORIES: PoiCategory[] = ['shelter']

interface GenerateStagesDialogProps {
  open: boolean
  onClose: () => void
  stages: AdventureStageResponse[]
  /** Types cochés dans la sidebar — sert de valeur par défaut du formulaire. */
  activeAccommodationTypes: Set<PoiCategory>
  /** Rayon de recherche courant (réglage utilisateur, story 17.16). */
  searchRadiusKm: number
  /** Date de départ de l'aventure, si renseignée. */
  adventureStartDate: string | null
  overpassEnabled: boolean
  /** Le profil doit être chargé avant de déclencher une requête (règle 9). */
  profileReady: boolean
  isGenerating: boolean
  onGenerate: (input: GenerateStagesInput) => Promise<void>
}

/** `YYYY-MM-DDTHH:mm` pour un `<input type="datetime-local">`. */
function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function defaultDeparture(
  stages: AdventureStageResponse[],
  adventureStartDate: string | null,
  mode: 'replace' | 'fill',
): string {
  // En « compléter », la suite logique est le lendemain de la dernière étape datée.
  if (mode === 'fill') {
    const last = [...stages].sort((a, b) => a.orderIndex - b.orderIndex).at(-1)
    if (last?.departureTime) {
      const next = new Date(last.departureTime)
      next.setDate(next.getDate() + 1)
      return toDatetimeLocal(next)
    }
  }

  // Sinon la date de l'aventure si elle existe, sinon aujourd'hui — à l'heure par défaut.
  const base = adventureStartDate ? new Date(`${adventureStartDate}T00:00:00`) : new Date()
  base.setHours(DEFAULT_DEPARTURE_HOUR, 0, 0, 0)
  return toDatetimeLocal(base)
}

export function GenerateStagesDialog({
  open,
  onClose,
  stages,
  activeAccommodationTypes,
  searchRadiusKm,
  adventureStartDate,
  overpassEnabled,
  profileReady,
  isGenerating,
  onGenerate,
}: GenerateStagesDialogProps) {
  const hasExistingStages = stages.length > 0
  const lastEndKm = useMemo(
    () => (hasExistingStages ? Math.max(...stages.map((s) => s.endKm)) : 0),
    [hasExistingStages, stages],
  )

  const [kmPerDay, setKmPerDay] = useState(String(DEFAULT_TARGET_KM_PER_DAY))
  const [maxElevation, setMaxElevation] = useState('')
  const [mode, setMode] = useState<'replace' | 'fill'>('fill')
  const [types, setTypes] = useState<Set<PoiCategory>>(new Set())
  const [departure, setDeparture] = useState('')
  const [confirmReplace, setConfirmReplace] = useState(false)

  // Réinitialise à l'ouverture — le formulaire reflète l'état courant de la sidebar.
  useEffect(() => {
    if (!open) return
    const initialMode = hasExistingStages ? 'fill' : 'replace'
    setKmPerDay(String(DEFAULT_TARGET_KM_PER_DAY))
    setMaxElevation('')
    setMode(initialMode)
    setTypes(new Set(activeAccommodationTypes.size > 0 ? activeAccommodationTypes : ['hotel']))
    setDeparture(defaultDeparture(stages, adventureStartDate, initialMode))
    setConfirmReplace(false)
  }, [open, hasExistingStages, activeAccommodationTypes, stages, adventureStartDate])

  // Changer de mode change la date qui « va de soi ».
  useEffect(() => {
    if (!open) return
    setDeparture(defaultDeparture(stages, adventureStartDate, mode))
  }, [mode, open, stages, adventureStartDate])

  const kmPerDayNum = Number(kmPerDay)
  const kmPerDayValid =
    Number.isFinite(kmPerDayNum) &&
    kmPerDayNum >= MIN_TARGET_KM_PER_DAY &&
    kmPerDayNum <= MAX_TARGET_KM_PER_DAY
  const onlyOsmTypes = types.size > 0 && [...types].every((t) => OSM_ONLY_CATEGORIES.includes(t))
  const canSubmit = kmPerDayValid && types.size > 0 && profileReady && !isGenerating

  const toggleType = (category: PoiCategory) => {
    setTypes((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  const buildInput = (): GenerateStagesInput => ({
    targetKmPerDay: kmPerDayNum,
    ...(maxElevation.trim() !== '' ? { maxElevationGainM: Number(maxElevation) } : {}),
    accommodationTypes: [...types],
    radiusKm: searchRadiusKm,
    mode,
    overpassEnabled,
    ...(departure ? { firstDepartureAt: new Date(departure).toISOString() } : {}),
    // Le serveur a besoin du fuseau pour incrémenter la date en gardant l'heure : un instant
    // seul ne dit pas que 06:00Z vaut « 08:00 à Paris ».
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  })

  const submit = async () => {
    if (!canSubmit) return
    if (mode === 'replace' && hasExistingStages) {
      setConfirmReplace(true)
      return
    }
    await onGenerate(buildInput())
  }

  const submitAfterConfirm = async () => {
    setConfirmReplace(false)
    await onGenerate(buildInput())
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && !isGenerating && onClose()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Générer les étapes
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="gen-km-per-day">Kilomètres par jour</Label>
              <Input
                id="gen-km-per-day"
                type="number"
                inputMode="numeric"
                min={MIN_TARGET_KM_PER_DAY}
                max={MAX_TARGET_KM_PER_DAY}
                value={kmPerDay}
                onChange={(e) => setKmPerDay(e.target.value)}
                aria-invalid={!kmPerDayValid}
              />
              <p className="text-xs text-muted-foreground">
                Objectif visé. Si aucun hébergement n’est trouvé, la fin d’étape est déplacée
                jusqu’à {STAGE_GEN_MAX_OFFSET_KM} km avant ou après.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="gen-max-elevation">D+ maximum par étape (m)</Label>
              <Input
                id="gen-max-elevation"
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="Sans limite"
                value={maxElevation}
                onChange={(e) => setMaxElevation(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Contrainte stricte : une étape ne dépassera jamais ce D+.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="gen-departure">Date et heure de départ</Label>
              <Input
                id="gen-departure"
                type="datetime-local"
                value={departure}
                onChange={(e) => setDeparture(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Chaque étape part le lendemain de la précédente, à la même heure.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Types d’hébergement</Label>
              <div className="flex flex-wrap gap-2">
                {ACCOMMODATION_SUB_TYPES.map(({ type, label, color }) => {
                  const active = types.has(type)
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => toggleType(type)}
                      aria-pressed={active}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        active ? 'text-white' : 'text-muted-foreground hover:bg-muted'
                      }`}
                      style={active ? { backgroundColor: color, borderColor: color } : undefined}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Une fin d’étape est retenue s’il y a au moins {STAGE_GEN_MIN_ACCOMMODATIONS}{' '}
                hébergements de ces types autour du point ({searchRadiusKm} km).
              </p>
              {types.size === 0 && (
                <p className="text-xs text-destructive">Choisissez au moins un type.</p>
              )}
              {onlyOsmTypes && (
                <p className="flex items-start gap-1.5 text-xs text-orange-600 dark:text-orange-400">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Les refuges et abris n’existent que dans OpenStreetMap : la génération
                    s’appuiera uniquement sur les données déjà en cache. Ajoutez un autre type
                    pour une recherche complète.
                  </span>
                </p>
              )}
            </div>

            {hasExistingStages && (
              <div className="space-y-2">
                <Label>Étapes existantes</Label>
                <div className="space-y-1.5">
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name="gen-mode"
                      className="mt-1"
                      checked={mode === 'fill'}
                      onChange={() => setMode('fill')}
                    />
                    <span>
                      Compléter à partir du km {Math.round(lastEndKm)}
                      <span className="block text-xs text-muted-foreground">
                        Les {stages.length} étape{stages.length > 1 ? 's' : ''} existante
                        {stages.length > 1 ? 's' : ''} ne sont pas modifiées.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name="gen-mode"
                      className="mt-1"
                      checked={mode === 'replace'}
                      onChange={() => setMode('replace')}
                    />
                    <span>
                      Remplacer les étapes existantes
                      <span className="block text-xs text-muted-foreground">
                        Les {stages.length} étape{stages.length > 1 ? 's' : ''} actuelle
                        {stages.length > 1 ? 's' : ''} seront supprimées.
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            )}

            {!profileReady && (
              <p className="text-xs text-muted-foreground">Chargement de vos préférences…</p>
            )}
            {isGenerating && (
              <p className="text-xs text-muted-foreground">
                Recherche des hébergements en cours — cela peut prendre jusqu’à une minute sur une
                zone jamais explorée.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="lg" onClick={onClose} disabled={isGenerating}>
              Annuler
            </Button>
            <Button size="lg" onClick={submit} disabled={!canSubmit}>
              {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Générer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmReplace} onOpenChange={setConfirmReplace}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remplacer les étapes existantes ?</AlertDialogTitle>
            <AlertDialogDescription>
              {stages.length} étape{stages.length > 1 ? 's' : ''} ser
              {stages.length > 1 ? 'ont' : 'a'} supprimée{stages.length > 1 ? 's' : ''} avant la
              génération. Cette action est définitive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={submitAfterConfirm}>
              Supprimer et générer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/**
 * Rendu d'un statut de génération.
 *
 * `no_accommodation` et `provider_unavailable` ont des messages **distincts** : dire « aucun
 * hébergement » alors qu'on n'a pas pu vérifier envoie l'utilisateur chercher un problème qui
 * n'existe pas.
 */
export function stageGenerationMessage(warning: StageGenerationWarning): string {
  const range =
    warning.fromKm !== null && warning.toKm !== null
      ? ` entre le km ${Math.round(warning.fromKm)} et le km ${Math.round(warning.toKm)}`
      : ''

  switch (warning.code) {
    case 'no_accommodation':
      return `Aucun hébergement correspondant${range}. Le reste du parcours n’est pas découpé — élargissez le rayon, ajoutez des types d’hébergement ou placez cette étape à la main.`
    case 'provider_unavailable':
      return `Vérification impossible${range} : le service de recherche n’a pas répondu. Réessayez dans un moment — cela ne veut pas dire qu’il n’y a pas d’hébergement.`
    case 'no_elevation_data':
      return 'Votre trace GPX ne contient pas d’altitudes : la contrainte de D+ a été ignorée.'
    case 'sparse_final_stage':
      return `La dernière étape s’arrête à la fin de la trace, avec peu d’hébergements à proximité${range}.`
    case 'truncated':
      return 'Nombre maximum d’étapes atteint pour une génération. Relancez en mode « Compléter » pour continuer.'
    case 'request_budget_reached':
      return 'Trop de vérifications pour une seule génération. Relancez en mode « Compléter » pour poursuivre.'
    case 'unexpected_billing':
      return 'Anomalie technique détectée pendant la génération (elle a été enregistrée). Les étapes créées sont valides.'
  }
}
