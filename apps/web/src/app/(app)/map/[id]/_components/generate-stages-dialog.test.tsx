import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GenerateStagesDialog, stageGenerationMessage } from './generate-stages-dialog'
import type { AdventureStageResponse, GenerateStagesInput, PoiCategory } from '@ridenrest/shared'

function makeStage(over: Partial<AdventureStageResponse> = {}): AdventureStageResponse {
  return {
    id: 'st1',
    adventureId: 'adv-1',
    name: 'Étape 1',
    color: '#f97316',
    orderIndex: 0,
    startKm: 0,
    endKm: 120,
    distanceKm: 120,
    elevationGainM: 800,
    elevationLossM: 700,
    etaMinutes: 480,
    departureTime: null,
    speedKmh: null,
    pauseHours: null,
    createdAt: '',
    updatedAt: '',
    ...over,
  }
}

// Typé sur la signature du prop : un `ReturnType<typeof vi.fn>` nu n'est pas assignable.
let onGenerate: ((input: GenerateStagesInput) => Promise<void>) & Mock

function renderDialog(over: Partial<Parameters<typeof GenerateStagesDialog>[0]> = {}) {
  return render(
    <GenerateStagesDialog
      open
      onClose={vi.fn()}
      stages={[]}
      activeAccommodationTypes={new Set<PoiCategory>(['hotel'])}
      searchRadiusKm={3}
      adventureStartDate={null}
      overpassEnabled={false}
      profileReady
      isGenerating={false}
      onGenerate={onGenerate}
      {...over}
    />,
  )
}

/** Dernier appel à onGenerate, typé. */
function lastInput(): GenerateStagesInput {
  return onGenerate.mock.calls.at(-1)![0] as GenerateStagesInput
}

beforeEach(() => {
  onGenerate = vi.fn().mockResolvedValue(undefined) as typeof onGenerate
})

// Pas d'auto-cleanup dans `test-setup.ts` : sans démontage explicite, les requêtes `screen.*`
// tombent sur le dialog du test précédent (convention suivie par les autres tests du dossier).
afterEach(cleanup)

describe('GenerateStagesDialog — champs', () => {
  it('pré-remplit les km/jour, l’heure de départ et les types cochés dans la sidebar', () => {
    renderDialog({ activeAccommodationTypes: new Set<PoiCategory>(['hotel', 'camp_site']) })

    expect(screen.getByLabelText('Kilomètres par jour')).toHaveValue(80)
    expect(screen.getByLabelText('D+ maximum par étape (m)')).toHaveValue(null)
    // Pas de startDate ici → aujourd'hui, à l'heure par défaut.
    expect((screen.getByLabelText('Date et heure de départ') as HTMLInputElement).value)
      .toMatch(/^\d{4}-\d{2}-\d{2}T08:00$/)
    expect(screen.getByRole('button', { name: 'Hôtel' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Camping' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Refuge / Abri' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('pré-remplit la date depuis adventure.startDate quand elle existe', () => {
    renderDialog({ adventureStartDate: '2026-09-05' })
    expect(screen.getByLabelText('Date et heure de départ')).toHaveValue('2026-09-05T08:00')
  })

  it('annonce le rayon courant plutôt qu’une valeur figée', () => {
    renderDialog({ searchRadiusKm: 12 })
    expect(screen.getByText(/au moins 3\s+hébergements de ces types autour du point \(12 km\)/)).toBeInTheDocument()
  })

  it('parle d’« autour du point » et jamais d’un rayon strict', () => {
    // La zone testée est une bbox (le masque IDs Only ne renvoie pas de coordonnées) : un coin
    // est à r·√2. Promettre « dans un rayon de » serait faux.
    renderDialog()
    expect(screen.getAllByText(/autour du point/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/dans un rayon de/)).not.toBeInTheDocument()
  })
})

describe('GenerateStagesDialog — validation', () => {
  it('désactive Générer tant qu’aucun type n’est coché', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByRole('button', { name: 'Hôtel' }))

    expect(screen.getByText('Choisissez au moins un type.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Générer' })).toBeDisabled()
  })

  it('désactive Générer sur un km/jour hors bornes', async () => {
    const user = userEvent.setup()
    renderDialog()

    const input = screen.getByLabelText('Kilomètres par jour')
    await user.clear(input)
    await user.type(input, '5')

    expect(screen.getByRole('button', { name: 'Générer' })).toBeDisabled()
  })

  it('désactive Générer tant que le profil n’est pas chargé (règle 9)', () => {
    renderDialog({ profileReady: false })
    expect(screen.getByRole('button', { name: 'Générer' })).toBeDisabled()
    expect(screen.getByText('Chargement de vos préférences…')).toBeInTheDocument()
  })

  it('avertit quand seuls des types OSM sont cochés — shelter n’a aucun type Google', async () => {
    const user = userEvent.setup()
    renderDialog({ activeAccommodationTypes: new Set<PoiCategory>(['shelter']) })

    expect(screen.getByText(/n’existent que dans OpenStreetMap/)).toBeInTheDocument()

    // Ajouter un type Google fait disparaître l'avertissement.
    await user.click(screen.getByRole('button', { name: 'Hôtel' }))
    expect(screen.queryByText(/n’existent que dans OpenStreetMap/)).not.toBeInTheDocument()
  })
})

describe('GenerateStagesDialog — envoi', () => {
  it('envoie la saisie, le rayon courant, le fuseau et le départ ISO', async () => {
    const user = userEvent.setup()
    renderDialog({ searchRadiusKm: 8, adventureStartDate: '2026-09-05', overpassEnabled: true })

    await user.clear(screen.getByLabelText('Kilomètres par jour'))
    await user.type(screen.getByLabelText('Kilomètres par jour'), '95')
    await user.type(screen.getByLabelText('D+ maximum par étape (m)'), '1500')
    await user.click(screen.getByRole('button', { name: 'Générer' }))

    const input = lastInput()
    expect(input.targetKmPerDay).toBe(95)
    expect(input.maxElevationGainM).toBe(1500)
    expect(input.accommodationTypes).toEqual(['hotel'])
    expect(input.radiusKm).toBe(8)
    expect(input.mode).toBe('replace')
    expect(input.overpassEnabled).toBe(true)
    expect(input.firstDepartureAt).toBe(new Date('2026-09-05T08:00').toISOString())
    // Sans le fuseau, le serveur ne peut pas incrémenter la date en gardant l'heure.
    expect(input.timeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
  })

  it('omet maxElevationGainM quand le champ est vide', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('button', { name: 'Générer' }))
    expect(lastInput().maxElevationGainM).toBeUndefined()
  })
})

describe('GenerateStagesDialog — étapes existantes', () => {
  it('n’offre pas le choix remplacer/compléter quand il n’y a rien à remplacer', () => {
    renderDialog({ stages: [] })
    expect(screen.queryByText('Étapes existantes')).not.toBeInTheDocument()
  })

  it('propose « Compléter à partir du km N » et le sélectionne par défaut', () => {
    renderDialog({ stages: [makeStage({ endKm: 120 })] })
    expect(screen.getByText(/Compléter à partir du km 120/)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Compléter/ })).toBeChecked()
  })

  it('pré-remplit la date au lendemain de la dernière étape datée en mode compléter', () => {
    renderDialog({
      stages: [makeStage({ departureTime: new Date('2026-09-10T08:00').toISOString() })],
    })
    expect(screen.getByLabelText('Date et heure de départ')).toHaveValue('2026-09-11T08:00')
  })

  it('exige une confirmation avant de remplacer, et ne génère pas avant', async () => {
    const user = userEvent.setup()
    renderDialog({ stages: [makeStage(), makeStage({ id: 'st2', orderIndex: 1 })] })

    await user.click(screen.getByRole('radio', { name: /Remplacer/ }))
    await user.click(screen.getByRole('button', { name: 'Générer' }))

    expect(screen.getByText('Remplacer les étapes existantes ?')).toBeInTheDocument()
    expect(screen.getByText(/2 étapes seront supprimées/)).toBeInTheDocument()
    expect(onGenerate).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Supprimer et générer' }))
    await waitFor(() => expect(onGenerate).toHaveBeenCalledTimes(1))
    expect(lastInput().mode).toBe('replace')
  })

  it('génère sans confirmation en mode compléter', async () => {
    const user = userEvent.setup()
    renderDialog({ stages: [makeStage()] })

    await user.click(screen.getByRole('button', { name: 'Générer' }))

    await waitFor(() => expect(onGenerate).toHaveBeenCalledTimes(1))
    expect(lastInput().mode).toBe('fill')
  })
})

describe('stageGenerationMessage', () => {
  it('distingue « aucun hébergement » de « vérification impossible »', () => {
    // Confondre les deux envoie l'utilisateur chercher un problème qui n'existe pas — c'est
    // exactement le raccourci qui a masqué cinq mois de panne Overpass.
    const absence = stageGenerationMessage({ code: 'no_accommodation', fromKm: 40, toKm: 120 })
    const failure = stageGenerationMessage({ code: 'provider_unavailable', fromKm: 40, toKm: 120 })

    expect(absence).toMatch(/Aucun hébergement correspondant entre le km 40 et le km 120/)
    expect(failure).toMatch(/Vérification impossible/)
    expect(failure).toMatch(/ne veut pas dire qu’il n’y a pas d’hébergement/)
    expect(failure).not.toMatch(/Aucun hébergement/)
  })

  it('couvre tous les codes de statut', () => {
    const codes = [
      'no_accommodation',
      'provider_unavailable',
      'no_elevation_data',
      'sparse_final_stage',
      'truncated',
      'request_budget_reached',
      'unexpected_billing',
    ] as const

    for (const code of codes) {
      const message = stageGenerationMessage({ code, fromKm: null, toKm: null })
      expect(message).toBeTruthy()
      expect(message).not.toContain('undefined')
    }
  })
})
