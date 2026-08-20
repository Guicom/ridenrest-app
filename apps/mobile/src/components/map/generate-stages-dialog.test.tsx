import { render, screen, userEvent } from '@testing-library/react-native';
import type {
  AdventureStageResponse,
  GenerateStagesInput,
  PoiCategory,
} from '@ridenrest/shared';

import {
  GenerateStagesDialog,
  defaultDeparture,
  stageGenerationMessage,
} from './generate-stages-dialog';

// Parité mobile du formulaire de génération (story 17.18, règle 10). Les tests visent les
// mêmes invariants que le web : rayon courant honoré, gate profil, avertissement OSM,
// confirmation avant remplacement, et distinction absence / échec fournisseur.

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
  };
}

let onSubmit: jest.Mock;

// RNTL 14 / React concurrent, deux pièges rencontrés ici :
// 1. `render` est asynchrone — sans `await`, `screen` reste vide (« render function has not
//    been called »). Convention du projet, cf. `stage-card.test.tsx`.
// 2. Deux `fireEvent.press` synchrones ne laissent pas React appliquer l'état entre les deux
//    (cocher un type puis soumettre repartait sur l'ancien état) → `userEvent`, qui est
//    asynchrone et enveloppe chaque interaction dans un `act`.
async function renderDialog(
  over: Partial<React.ComponentProps<typeof GenerateStagesDialog>> = {},
) {
  return render(
    <GenerateStagesDialog
      open
      stages={[]}
      activeAccommodationTypes={new Set<PoiCategory>(['hotel'])}
      searchRadiusKm={3}
      adventureStartDate={null}
      overpassEnabled={false}
      profileReady
      isGenerating={false}
      onSubmit={onSubmit}
      onClose={jest.fn()}
      {...over}
    />,
  );
}

function lastInput(): GenerateStagesInput {
  return onSubmit.mock.calls.at(-1)![0] as GenerateStagesInput;
}

beforeEach(() => {
  onSubmit = jest.fn();
});

describe('defaultDeparture', () => {
  it('utilise adventure.startDate à l’heure par défaut', () => {
    expect(defaultDeparture([], '2026-09-05', 'replace')).toBe('2026-09-05 08:00');
  });

  it('en mode compléter, part du lendemain de la dernière étape datée', () => {
    const stages = [
      makeStage({ departureTime: new Date('2026-09-10T08:00').toISOString() }),
    ];
    expect(defaultDeparture(stages, null, 'fill')).toBe('2026-09-11 08:00');
  });

  it('retombe sur aujourd’hui 08:00 sans date d’aventure', () => {
    expect(defaultDeparture([], null, 'replace')).toMatch(/^\d{4}-\d{2}-\d{2} 08:00$/);
  });
});

describe('GenerateStagesDialog', () => {
  it('envoie la saisie, le rayon courant et le fuseau', async () => {
    const user = userEvent.setup();
    await renderDialog({ searchRadiusKm: 8, adventureStartDate: '2026-09-05' });

    await user.press(screen.getByTestId('generate-submit'));

    const input = lastInput();
    expect(input.targetKmPerDay).toBe(80);
    expect(input.accommodationTypes).toEqual(['hotel']);
    expect(input.radiusKm).toBe(8);
    expect(input.mode).toBe('replace');
    expect(input.firstDepartureAt).toBe(new Date('2026-09-05T08:00').toISOString());
    // Sans le fuseau, le serveur ne peut pas garder l'heure murale d'un jour à l'autre.
    expect(input.timeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it('annonce le rayon courant, et parle « autour du point »', async () => {
    // La zone testée est une bbox (masque IDs Only, sans coordonnées) : un coin est à r·√2.
    await renderDialog({ searchRadiusKm: 12 });
    expect(screen.getByText(/autour du point \(12 km\)/)).toBeTruthy();
    expect(screen.queryByText(/dans un rayon de/)).toBeNull();
  });

  it('ne soumet pas tant que le profil n’est pas chargé (règle 9)', async () => {
    const user = userEvent.setup();
    await renderDialog({ profileReady: false });

    await user.press(screen.getByTestId('generate-submit'));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/Chargement de vos préférences/)).toBeTruthy();
  });

  it('ne soumet pas quand aucun type n’est coché', async () => {
    const user = userEvent.setup();
    await renderDialog();

    await user.press(screen.getByTestId('generate-type-hotel')); // décoche
    await user.press(screen.getByTestId('generate-submit'));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/Choisissez au moins un type/)).toBeTruthy();
  });

  it('avertit quand seuls des types OSM sont cochés', async () => {
    await renderDialog({ activeAccommodationTypes: new Set<PoiCategory>(['shelter']) });
    expect(screen.getByText(/n’existent que dans OpenStreetMap/)).toBeTruthy();
  });

  it('exige une confirmation avant de remplacer', async () => {
    const user = userEvent.setup();
    await renderDialog({ stages: [makeStage(), makeStage({ id: 'st2', orderIndex: 1 })] });

    await user.press(screen.getByTestId('generate-mode-replace'));
    await user.press(screen.getByTestId('generate-submit'));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/Remplacer les étapes existantes \?/)).toBeTruthy();

    await user.press(screen.getByTestId('generate-confirm-replace'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(lastInput().mode).toBe('replace');
  });

  it('génère sans confirmation en mode compléter', async () => {
    const user = userEvent.setup();
    await renderDialog({ stages: [makeStage()] });

    await user.press(screen.getByTestId('generate-submit'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(lastInput().mode).toBe('fill');
  });
});

describe('stageGenerationMessage', () => {
  // `t` factice : on vérifie le routage code → clé, pas les traductions (verrouillées par
  // `locale-parity.test.ts`).
  const t = (key: string, opts?: Record<string, unknown>) =>
    `${key}${opts ? `:${JSON.stringify(opts)}` : ''}`;

  it('distingue l’absence de l’échec de vérification', () => {
    const absence = stageGenerationMessage(
      { code: 'no_accommodation', fromKm: 40, toKm: 120 },
      t,
    );
    const failure = stageGenerationMessage(
      { code: 'provider_unavailable', fromKm: 40, toKm: 120 },
      t,
    );

    expect(absence).toContain('warnNoAccommodation');
    expect(failure).toContain('warnProviderUnavailable');
    expect(failure).not.toContain('warnNoAccommodation');
  });

  it('couvre tous les codes de statut', () => {
    const codes = [
      'no_accommodation',
      'provider_unavailable',
      'no_elevation_data',
      'sparse_final_stage',
      'truncated',
      'request_budget_reached',
      'unexpected_billing',
    ] as const;

    for (const code of codes) {
      const message = stageGenerationMessage({ code, fromKm: null, toKm: null }, t);
      expect(message).toBeTruthy();
      expect(message).not.toContain('undefined');
    }
  });
});
