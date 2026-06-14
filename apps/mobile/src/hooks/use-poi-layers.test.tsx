import { act, render } from '@testing-library/react-native';
import type { MapLayer } from '@ridenrest/shared';
import { createElement } from 'react';

import { ALL_MAP_LAYERS, usePoiLayers, type PoiLayersState } from '@/hooks/use-poi-layers';

// Modèle de calques (MOB-4.2 / AC1, T2). Hook d'état simple : on l'exerce via un
// composant-sonde (capture dans le corps de rendu — `renderHook` peu fiable sous
// React 19 / RNTL v14, leçon MOB-3.1) et on observe `visibleLayers` après `toggleLayer`.

async function mountHook(): Promise<{ current: PoiLayersState }> {
  const ref = { current: undefined as unknown as PoiLayersState };
  function Probe() {
    ref.current = usePoiLayers();
    return null;
  }
  await render(createElement(Probe));
  return ref;
}

describe('usePoiLayers (T2 — modèle de calques)', () => {
  it('défaut : seul `accommodations` est visible (parité web)', async () => {
    const hook = await mountHook();
    expect([...hook.current.visibleLayers]).toEqual(['accommodations']);
    expect(hook.current.isLayerVisible('accommodations')).toBe(true);
    expect(hook.current.isLayerVisible('restaurants')).toBe(false);
  });

  it('toggle ajoute un calque inactif', async () => {
    const hook = await mountHook();
    await act(async () => hook.current.toggleLayer('restaurants'));
    expect(hook.current.visibleLayers.has('restaurants')).toBe(true);
    expect(hook.current.visibleLayers.has('accommodations')).toBe(true);
  });

  it('toggle retire un calque actif', async () => {
    const hook = await mountHook();
    await act(async () => hook.current.toggleLayer('accommodations'));
    expect(hook.current.visibleLayers.has('accommodations')).toBe(false);
    expect(hook.current.visibleLayers.size).toBe(0);
  });

  it('toggles indépendants : 4 calques activables simultanément', async () => {
    const hook = await mountHook();
    for (const layer of ['restaurants', 'supplies', 'bike'] as MapLayer[]) {
      await act(async () => hook.current.toggleLayer(layer));
    }
    expect(hook.current.visibleLayers.size).toBe(4);
  });

  it('expose les 4 calques canon dans l’ordre web', () => {
    expect(ALL_MAP_LAYERS).toEqual([
      'accommodations',
      'restaurants',
      'supplies',
      'bike',
    ]);
  });
});
