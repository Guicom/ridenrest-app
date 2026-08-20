import type { AdventureStageResponse } from '@ridenrest/shared';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { StageCard } from '@/components/map/stage-card';
import { i18n } from '@/lib/i18n';

// StageCard — affichage (nom, distance, D±, ETA) + actions edit/delete.

function makeStage(over: Partial<AdventureStageResponse> = {}): AdventureStageResponse {
  return {
    id: 'st1',
    adventureId: 'a1',
    name: 'Jour 1',
    color: '#f97316',
    orderIndex: 0,
    startKm: 0,
    endKm: 80,
    distanceKm: 80,
    elevationGainM: 1200,
    elevationLossM: 900,
    etaMinutes: 300,
    departureTime: null,
    speedKmh: null,
    pauseHours: null,
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

describe('StageCard', () => {
  // `etaMinutes` est une DURÉE : « ETA 5h » se lisait comme une heure d'horloge (retour
  // utilisateur 2026-08-20). Sans départ renseigné, on n'affiche que la durée.
  it('affiche nom, distance, D+/D− et durée', async () => {
    await render(
      <StageCard stage={makeStage()} onEdit={jest.fn()} onDelete={jest.fn()} />,
    );
    expect(screen.getByText('Jour 1')).toBeOnTheScreen();
    expect(screen.getByText('↑ 1200 m')).toBeOnTheScreen();
    expect(screen.getByText('↓ 900 m')).toBeOnTheScreen();
    expect(screen.getByText('Durée 5h')).toBeOnTheScreen();
  });

  it('boutons edit / delete déclenchent les callbacks', async () => {
    const onEdit = jest.fn();
    const onDelete = jest.fn();
    await render(
      <StageCard stage={makeStage()} onEdit={onEdit} onDelete={onDelete} />,
    );
    fireEvent.press(screen.getByLabelText(i18n.t('common.rename')));
    fireEvent.press(screen.getByLabelText(i18n.t('common.delete')));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
