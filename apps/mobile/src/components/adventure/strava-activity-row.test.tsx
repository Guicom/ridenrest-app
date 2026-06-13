import { render, screen, userEvent } from '@testing-library/react-native';

import { StravaActivityRow } from '@/components/adventure/strava-activity-row';
import type { StravaRouteItem } from '@/hooks/use-strava';
import { i18n } from '@/lib/i18n';

// Ligne d'itinéraire Strava (MOB-3.4 / T3, AC2, AC6). i18n réel (fr en test).
const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, o);

function makeRoute(overrides: Partial<StravaRouteItem> = {}): StravaRouteItem {
  return {
    id: '987654321098765432',
    name: 'Tour du Mont-Blanc',
    distanceKm: 42.34,
    elevationGainM: 1234,
    ...overrides,
  };
}

describe('StravaActivityRow (MOB-3.4 / T3)', () => {
  it('rend nom, distance (virgule FR) et D+', async () => {
    await render(
      <StravaActivityRow
        route={makeRoute()}
        onImport={jest.fn()}
        importing={false}
        disabled={false}
      />,
    );
    expect(screen.getByText('Tour du Mont-Blanc')).toBeTruthy();
    // formatKm(42.34,'fr') → '42,3' ; clé `distance` → '42,3 km'.
    expect(screen.getByText('42,3 km')).toBeTruthy();
    expect(screen.getByText('+1234 m')).toBeTruthy();
    expect(screen.getByText(t('strava.import.importButton'))).toBeTruthy();
  });

  it('D+ null → pas de dénivelé affiché', async () => {
    await render(
      <StravaActivityRow
        route={makeRoute({ elevationGainM: null })}
        onImport={jest.fn()}
        importing={false}
        disabled={false}
      />,
    );
    expect(screen.queryByText('+1234 m')).toBeNull();
  });

  it('press « Importer » → onImport()', async () => {
    const onImport = jest.fn();
    const user = userEvent.setup();
    await render(
      <StravaActivityRow
        route={makeRoute()}
        onImport={onImport}
        importing={false}
        disabled={false}
      />,
    );
    await user.press(screen.getByText(t('strava.import.importButton')));
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  it('importing → libellé « Import… », bouton occupé (busy)', async () => {
    await render(
      <StravaActivityRow
        route={makeRoute()}
        onImport={jest.fn()}
        importing
        disabled={false}
      />,
    );
    expect(screen.getByText(t('strava.import.importing'))).toBeTruthy();
    // Bouton en loading → `accessibilityState.busy` + désactivé (Button primitif).
    const button = screen.getByRole('button');
    expect(button.props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
    });
  });

  it('disabled (autre import en cours) → bouton désactivé', async () => {
    await render(
      <StravaActivityRow
        route={makeRoute()}
        onImport={jest.fn()}
        importing={false}
        disabled
      />,
    );
    const button = screen.getByRole('button');
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
  });
});
