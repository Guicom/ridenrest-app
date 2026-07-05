import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import type { AccessVariant } from '@ridenrest/shared';
import { useMemo } from 'react';

import {
  ACCESS_CASING_COLOR,
  ACCESS_CASING_LAYER_ID,
  ACCESS_GHOST_COLOR,
  ACCESS_GHOST_LAYER_ID,
  ACCESS_LINE_LAYER_ID,
  ACCESS_ROUTE_COLOR,
  ACCESS_SOURCE_ID,
  buildAccessFeatureCollection,
  extractTappedVariantIndex,
  ghostFilter,
  selectedFilter,
} from '@/lib/map/access-features';

// Polyline d'itinéraire d'accès POI sur la carte (MOB-4.7 / T1, AC1-2,5 — port du web
// `AccessMapLayer`). **Enfant du `<Map>`** (via `MapCanvas` children), inséré AU-DESSUS
// de la trace (`afterId="trace-line"`) et SOUS les pins POI (montés au sommet). Une seule
// source GeoJSON (une feature par variante, propriété `idx`) + 3 calques empilés bas→haut :
//   - `ghost`  : variantes non sélectionnées, gris pointillé, **tapable → onSelect(idx)** ;
//   - `casing` : liseré blanc continu sous la sélection (contraste tous fonds) ;
//   - `line`   : variante sélectionnée, magenta pointillé.
// La variante affichée est isolée par un **filtre `idx`** (pas de remove/add de calque) :
// changer `selectedIndex` met juste à jour le filtre → la sélection suit (AC3).
//
// **Robustesse reload de style (AC5)** : contrairement au web (qui ré-ajoute les calques
// impérativement sur `styledata`), le modèle **déclaratif** de `@maplibre/maplibre-react-native`
// ré-attache automatiquement source + calques quand le style se recharge (changement de
// thème) — exactement comme les autres overlays déclaratifs (densité/étapes/corridor).
// Aucun doublon : MapLibre dédoublonne par `id` de source/calque.
//
// **Ordre interne** : chaque calque est ancré au précédent (`ghost`→trace-line,
// `casing`→ghost, `line`→casing) → empilement déterministe quel que soit l'ordre de
// montage natif, même si la polyline apparaît tardivement (après les pins).

export interface AccessMapLayerProps {
  /** Variantes d'accès (`status === 'ok'`). `null`/`[]` → rien dessiné (unicité AC2). */
  variants: AccessVariant[] | null;
  /** Index de la variante sélectionnée (état lifté écran, partagé avec les chips fiche). */
  selectedIndex: number;
  /** Tap sur une variante fantôme → sélection (synchro chips MOB-4.6). */
  onSelect?: (index: number) => void;
}

const LINE_LAYOUT = { 'line-cap': 'round', 'line-join': 'round' } as const;

export function AccessMapLayer({
  variants,
  selectedIndex,
  onSelect,
}: AccessMapLayerProps) {
  const data = useMemo(
    () => buildAccessFeatureCollection(variants ?? []),
    [variants],
  );

  // Rien à dessiner (fiche fermée / loading / fallback / géométrie vide) → AC2 (unicité :
  // une seule polyline, masquée quand aucun POI sélectionné).
  if (!variants || variants.length === 0 || data.features.length === 0) return null;

  // Clamp défensif : un index hors plage (variantes réduites) retomberait sur « aucune
  // sélection visible ». On borne à la dernière variante disponible.
  const sel = Math.min(Math.max(selectedIndex, 0), variants.length - 1);

  const handlePress = (event: unknown) => {
    const idx = extractTappedVariantIndex(event);
    if (idx !== null) onSelect?.(idx);
  };

  return (
    <GeoJSONSource
      id={ACCESS_SOURCE_ID}
      data={data}
      onPress={onSelect ? handlePress : undefined}
    >
      {/* Fantômes : gris pointillé, juste au-dessus de la trace, tapables. */}
      <Layer
        id={ACCESS_GHOST_LAYER_ID}
        type="line"
        afterId="trace-line"
        filter={ghostFilter(sel)}
        layout={LINE_LAYOUT}
        paint={{
          'line-color': ACCESS_GHOST_COLOR,
          'line-width': 3,
          'line-dasharray': [2, 2],
          'line-opacity': 0.55,
        }}
      />
      {/* Liseré blanc CONTINU sous la sélection — halo de contraste. */}
      <Layer
        id={ACCESS_CASING_LAYER_ID}
        type="line"
        afterId={ACCESS_GHOST_LAYER_ID}
        filter={selectedFilter(sel)}
        layout={LINE_LAYOUT}
        paint={{
          'line-color': ACCESS_CASING_COLOR,
          'line-width': 7,
          'line-opacity': 0.9,
        }}
      />
      {/* Variante sélectionnée : magenta pointillé. */}
      <Layer
        id={ACCESS_LINE_LAYER_ID}
        type="line"
        afterId={ACCESS_CASING_LAYER_ID}
        filter={selectedFilter(sel)}
        layout={LINE_LAYOUT}
        paint={{
          'line-color': ACCESS_ROUTE_COLOR,
          'line-width': 4,
          'line-dasharray': [2, 2],
          'line-opacity': 1,
        }}
      />
    </GeoJSONSource>
  );
}
