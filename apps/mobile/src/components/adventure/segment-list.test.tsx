import type { AdventureSegmentResponse } from '@ridenrest/shared';
import { render, screen, userEvent } from '@testing-library/react-native';

import { SegmentList } from '@/components/adventure/segment-list';
import { i18n } from '@/lib/i18n';

// Test de composant (co-localisé — pas une route). Vérifie : distance + dénivelé
// (D+/D-) formatés (valeurs serveur, parité web mobile), libellé « Analyse en
// cours… » pour un segment non `done`, présence du drag handle (a11y label), et
// appel `onReorder(orderedIds)` quand le drag termine.
//
// ⚠️ Mock de `react-native-reorderable-list` SANS JSX RN dans la factory (le transform
// NativeWind injecte une variable hors-scope interdite par jest) : le mock RETOURNE un
// tableau d'éléments DÉJÀ construits (header + items + footer/empty) — les vrais
// composants RN viennent du `renderItem` / des props. On capture `onReorder` pour
// simuler la fin d'un drag (équivalent « simulate-drag-end »).

// Capture l'`onReorder` de la ReorderableList → déclencheur de reorder testable.
let mockLastOnReorder: ((e: { from: number; to: number }) => void) | null = null;

jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => ({ colorScheme: 'light' }),
}));

jest.mock('react-native-reorderable-list', () => {
  const ReorderableList = ({
    data,
    renderItem,
    onReorder,
    ListHeaderComponent,
    ListFooterComponent,
    ListEmptyComponent,
  }: any) => {
    if (onReorder) mockLastOnReorder = onReorder;
    const list = data ?? [];
    const withKey = (child: any, key: string) =>
      child && typeof child === 'object' ? { ...child, key } : child;
    const items = list.map((item: { id: string }, index: number) => {
      const child = renderItem({ item, index });
      return withKey(child, item.id);
    });
    return [
      withKey(ListHeaderComponent, 'header'),
      ...(list.length === 0 ? [withKey(ListEmptyComponent, 'empty')] : items),
      withKey(ListFooterComponent, 'footer'),
    ];
  };
  const useReorderableDrag = () => () => {};
  const reorderItems = <T,>(arr: T[], from: number, to: number): T[] => {
    const copy = arr.slice();
    const [moved] = copy.splice(from, 1);
    copy.splice(to, 0, moved);
    return copy;
  };
  return {
    __esModule: true,
    default: ReorderableList,
    useReorderableDrag,
    reorderItems,
  };
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
  mockLastOnReorder = null;
});

describe('SegmentList (MOB-3.3 / AC1, AC4 — parité web mobile)', () => {
  const baseProps = {
    adventureId: 'adv-1',
    onReorder: jest.fn(),
    onRename: jest.fn(),
    onDelete: jest.fn(),
    onReplace: jest.fn(),
  };

  it('affiche distance + dénivelé (D+/D-) formatés (serveur) pour un segment done', async () => {
    await render(
      <SegmentList
        {...baseProps}
        segments={[
          makeSegment('a', {
            distanceKm: 42.34,
            elevationGainM: 527,
            elevationLossM: 1013,
          }),
        ]}
      />,
    );
    expect(
      screen.getByText(t('adventures.segments.distanceKm', { value: '42,3' })),
    ).toBeTruthy();
    expect(
      screen.getByText(
        `${t('adventures.segments.gainDPlus', { value: 527 })} · ${t(
          'adventures.segments.lossDMinus',
          { value: 1013 },
        )}`,
      ),
    ).toBeTruthy();
  });

  it('n’affiche pas de cumul (info retirée)', async () => {
    await render(
      <SegmentList {...baseProps} segments={[makeSegment('a')]} />,
    );
    expect(screen.queryByText(/Cumul/i)).toBeNull();
  });

  it('affiche « Analyse en cours… » pour un segment non done', async () => {
    await render(
      <SegmentList
        {...baseProps}
        segments={[makeSegment('a', { parseStatus: 'processing' })]}
      />,
    );
    expect(screen.getByText(t('adventures.segments.parsing'))).toBeTruthy();
  });

  it('affiche l’attribution Strava sur un segment importé', async () => {
    await render(
      <SegmentList
        {...baseProps}
        segments={[makeSegment('a', { source: 'strava' })]}
      />,
    );
    expect(screen.getByLabelText('Powered by Strava')).toBeTruthy();
  });

  it('expose un drag handle avec label a11y', async () => {
    await render(
      <SegmentList {...baseProps} segments={[makeSegment('a')]} />,
    );
    expect(
      screen.getByLabelText(t('adventures.segments.reorderA11y')),
    ).toBeTruthy();
  });

  it('appelle onReorder(orderedIds) à la fin du drag (from/to → ids réordonnés)', async () => {
    const onReorder = jest.fn();
    await render(
      <SegmentList
        {...baseProps}
        onReorder={onReorder}
        segments={[makeSegment('a'), makeSegment('b'), makeSegment('c')]}
      />,
    );
    // Simule un drag qui déplace c (index 2) en tête (index 0) → c, a, b.
    expect(mockLastOnReorder).toBeTruthy();
    mockLastOnReorder?.({ from: 2, to: 0 });
    expect(onReorder).toHaveBeenCalledWith(['c', 'a', 'b']);
  });

  it('n’appelle pas onReorder si l’ordre est inchangé (from === to)', async () => {
    const onReorder = jest.fn();
    await render(
      <SegmentList
        {...baseProps}
        onReorder={onReorder}
        segments={[makeSegment('a'), makeSegment('b')]}
      />,
    );
    mockLastOnReorder?.({ from: 1, to: 1 });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('n’appelle pas onReorder pendant une mutation reorder/delete en vol', async () => {
    const onReorder = jest.fn();
    await render(
      <SegmentList
        {...baseProps}
        onReorder={onReorder}
        segments={[makeSegment('a'), makeSegment('b'), makeSegment('c')]}
        isReordering
      />,
    );
    mockLastOnReorder?.({ from: 2, to: 0 });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('ignore un événement reorder hors bornes', async () => {
    const onReorder = jest.fn();
    await render(
      <SegmentList
        {...baseProps}
        onReorder={onReorder}
        segments={[makeSegment('a'), makeSegment('b')]}
      />,
    );
    mockLastOnReorder?.({ from: 2, to: 0 });
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
