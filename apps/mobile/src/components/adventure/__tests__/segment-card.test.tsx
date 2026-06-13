import type { AdventureSegmentResponse } from '@ridenrest/shared';
import { render, screen, userEvent } from '@testing-library/react-native';

import { SegmentCard } from '@/components/adventure/segment-card';
import { i18n } from '@/lib/i18n';

// Rendu des 4 états de la carte segment (MOB-3.2 / AC2-3). i18n réel (fr en test).
const t = (k: string, opts?: Record<string, unknown>) => i18n.t(k, opts);

function makeSegment(
  overrides: Partial<AdventureSegmentResponse> = {},
): AdventureSegmentResponse {
  return {
    id: 'seg-1',
    adventureId: 'adv-1',
    name: 'Étape 1 — Col du Galibier',
    orderIndex: 0,
    cumulativeStartKm: 0,
    distanceKm: 12.3,
    elevationGainM: 100,
    elevationLossM: 50,
    parseStatus: 'done',
    source: null,
    boundingBox: null,
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('SegmentCard (MOB-3.2 — 4 états)', () => {
  it('pending/processing → badge d’état, pas de distance affichée', async () => {
    await render(<SegmentCard segment={makeSegment({ parseStatus: 'pending' })} />);
    expect(screen.getByText(t('adventures.segments.status.pending'))).toBeTruthy();
    // En cours d'analyse → pas de valeur de distance (skeleton à la place).
    expect(screen.queryByText('12.3 km')).toBeNull();
  });

  it('done → nom, distance, dénivelé D+/D- et badge « Analysé »', async () => {
    await render(<SegmentCard segment={makeSegment()} />);
    expect(screen.getByText('Étape 1 — Col du Galibier')).toBeTruthy();
    expect(screen.getByText('12.3 km')).toBeTruthy();
    expect(screen.getByText('↑ 100 m · ↓ 50 m')).toBeTruthy();
    expect(screen.getByText(t('adventures.segments.status.done'))).toBeTruthy();
  });

  it('done avec dénivelé null → « N/A »', async () => {
    await render(
      <SegmentCard
        segment={makeSegment({ elevationGainM: null, elevationLossM: null })}
      />,
    );
    expect(screen.getByText('N/A · N/A')).toBeTruthy();
  });

  it('error → ErrorBanner + bouton « Réessayer » (onRetry au press)', async () => {
    const onRetry = jest.fn();
    const user = userEvent.setup();
    const errored = makeSegment({ parseStatus: 'error' });
    await render(<SegmentCard segment={errored} onRetry={onRetry} />);

    expect(screen.getByText(t('adventures.segments.parseFailed'))).toBeTruthy();
    await user.press(screen.getByText(t('adventures.segments.retry')));
    expect(onRetry).toHaveBeenCalledWith(errored);
  });
});
