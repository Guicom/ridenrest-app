import type { AdventureSegmentResponse } from '@ridenrest/shared';
import { render, screen, userEvent } from '@testing-library/react-native';

import { SegmentList } from '@/components/adventure/segment-list';
import { i18n } from '@/lib/i18n';

// Test de composant (co-localisé — pas une route). Vérifie : distances formatées
// (total + cumul/longueur via formatKm), libellé « Analyse en cours… » pour un
// segment non `done`, présence du drag handle (a11y label), et appel
// `onReorder(orderedIds)` quand le drag termine.
//
// ⚠️ Mock de `react-native-reanimated-dnd` SANS JSX RN dans la factory (le transform
// NativeWind injecte une variable hors-scope interdite par jest) : on construit les
// éléments via `React.createElement` et on capture le dernier `onDrop` reçu pour
// pouvoir simuler la fin d'un drag (gotcha AGENTS.md ; parité « simulate-drag-end »
// de la story web 3.3).

// Capture le `onDrop` du dernier SortableItem rendu → déclencheur de reorder testable.
let mockLastOnDrop:
  | ((id: string, position: number, allPositions?: Record<string, number>) => void)
  | null = null;

jest.mock('react-native-reanimated-dnd', () => {
  // ⚠️ Ni JSX ni `React.createElement`/`require('react-native')` dans cette factory :
  // le transform NativeWind réécrit ces appels et injecte `_ReactNativeCSSInterop`
  // (variable hors-scope interdite par jest). Les composants mockés se contentent de
  // RETOURNER leurs `children` (React rend un node nu) — les vrais composants RN
  // viennent des `children` du composant testé. On capture le `onDrop` du dernier
  // `SortableItem` pour simuler la fin d'un drag (parité « simulate-drag-end » web 3.3).

  // Sortable : rend `renderItem` pour chaque item avec des props factices.
  const Sortable = ({ data, renderItem }: any) =>
    data.map((item: { id: string }, index: number) =>
      renderItem({
        item,
        index,
        id: item.id,
        positions: { value: {} },
        lowerBound: { value: 0 },
        autoScrollDirection: { value: 'none' },
        itemsCount: data.length,
      }),
    );

  const SortableItem = ({ children, onDrop }: any) => {
    if (onDrop) mockLastOnDrop = onDrop;
    return children;
  };
  SortableItem.Handle = ({ children }: any) => children;

  return { Sortable, SortableItem };
});

const t = (k: string, opts?: Record<string, unknown>) => i18n.t(k, opts);

function makeSegment(
  id: string,
  overrides: Partial<AdventureSegmentResponse> = {},
): AdventureSegmentResponse {
  return {
    id,
    adventureId: 'adv-1',
    name: `Segment ${id}`,
    orderIndex: 0,
    cumulativeStartKm: 0,
    distanceKm: 42.3,
    elevationGainM: null,
    elevationLossM: null,
    parseStatus: 'done',
    source: null,
    boundingBox: null,
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T10:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  mockLastOnDrop = null;
});

describe('SegmentList (MOB-3.3 / AC1, AC4)', () => {
  const baseProps = {
    adventureId: 'adv-1',
    onReorder: jest.fn(),
    onRename: jest.fn(),
    onDelete: jest.fn(),
    onReplace: jest.fn(),
  };

  it('affiche la distance totale formatée (serveur)', async () => {
    await render(
      <SegmentList
        {...baseProps}
        segments={[makeSegment('a')]}
        totalDistanceKm={128.6}
      />,
    );
    expect(
      screen.getByText(
        t('adventures.segments.totalDistance', { km: '128,6' }),
      ),
    ).toBeTruthy();
  });

  it('affiche cumul + longueur formatés pour un segment done', async () => {
    await render(
      <SegmentList
        {...baseProps}
        segments={[
          makeSegment('a', { cumulativeStartKm: 0, distanceKm: 42.34 }),
        ]}
        totalDistanceKm={42.3}
      />,
    );
    expect(
      screen.getByText(t('adventures.segments.cumulative', { km: '0' })),
    ).toBeTruthy();
    expect(
      screen.getByText(t('adventures.segments.length', { km: '42,3' })),
    ).toBeTruthy();
  });

  it('affiche « Analyse en cours… » pour un segment non done', async () => {
    await render(
      <SegmentList
        {...baseProps}
        segments={[makeSegment('a', { parseStatus: 'processing' })]}
        totalDistanceKm={0}
      />,
    );
    expect(screen.getByText(t('adventures.segments.parsing'))).toBeTruthy();
  });

  it('expose un drag handle avec label a11y', async () => {
    await render(
      <SegmentList
        {...baseProps}
        segments={[makeSegment('a')]}
        totalDistanceKm={42.3}
      />,
    );
    expect(
      screen.getByLabelText(t('adventures.segments.reorderA11y')),
    ).toBeTruthy();
  });

  it('appelle onReorder(orderedIds) à la fin du drag (positions → ids triés)', async () => {
    const onReorder = jest.fn();
    await render(
      <SegmentList
        {...baseProps}
        onReorder={onReorder}
        segments={[makeSegment('a'), makeSegment('b'), makeSegment('c')]}
        totalDistanceKm={120}
      />,
    );
    // Simule la fin d'un drag qui place c, a, b.
    expect(mockLastOnDrop).toBeTruthy();
    mockLastOnDrop?.('c', 0, { c: 0, a: 1, b: 2 });
    expect(onReorder).toHaveBeenCalledWith(['c', 'a', 'b']);
  });

  it('n’appelle pas onReorder si l’ordre est inchangé', async () => {
    const onReorder = jest.fn();
    await render(
      <SegmentList
        {...baseProps}
        onReorder={onReorder}
        segments={[makeSegment('a'), makeSegment('b')]}
        totalDistanceKm={84}
      />,
    );
    mockLastOnDrop?.('a', 0, { a: 0, b: 1 });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('déclenche les actions rename/replace/delete', async () => {
    const onRename = jest.fn();
    const onReplace = jest.fn();
    const onDelete = jest.fn();
    const user = userEvent.setup();
    const segment = makeSegment('a');
    await render(
      <SegmentList
        {...baseProps}
        onRename={onRename}
        onReplace={onReplace}
        onDelete={onDelete}
        segments={[segment]}
        totalDistanceKm={42.3}
      />,
    );
    await user.press(screen.getByLabelText(t('adventures.segments.rename')));
    await user.press(screen.getByLabelText(t('adventures.segments.replace')));
    await user.press(screen.getByLabelText(t('adventures.segments.delete')));
    expect(onRename).toHaveBeenCalledWith(segment);
    expect(onReplace).toHaveBeenCalledWith(segment);
    expect(onDelete).toHaveBeenCalledWith(segment);
  });
});
