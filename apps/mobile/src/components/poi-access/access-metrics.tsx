import type { AccessOrigin, PoiCategory } from '@ridenrest/shared';
import { Text, View } from 'react-native';

import { TrendingDownIcon, TrendingUpIcon } from '@/components/ui/icon';
import { useAccess } from '@/hooks/use-access';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { useTranslation } from '@/lib/i18n';
import { getAccessLabelKey } from '@/lib/poi-labels';
import { AccessFallback } from './access-fallback';
import { AccessMetricsSkeleton } from './access-metrics-skeleton';
import { VariantSelector } from './variant-selector';
import { formatAccessDistance, formatAccessElevation } from './format';

// Métriques d'accès cyclable réel vers un POI d'hébergement (MOB-4.6 / T4, AC1-5 —
// parité web `AccessMetrics`, variante `full`).
//
// États (ordre de précédence) :
//   1. **loading** → skeleton DÉDIÉ (jamais un spinner générique, FR-PA-018).
//   2. **ok** → libellé contextualisé + distance + D+ + D- + sélecteur de variantes.
//   3. **fallback** → distance à vol d'oiseau + badge « ≈ approximatif » (BRouter KO).
//   4. **offline sans cache** → message « indisponible hors-ligne » (non bloquant, AC6).
//   5. **error / pas de donnée exploitable** → message muted « indisponible ».
//
// Le hook `useAccess` est lazy : ce composant n'est monté que pour un POI d'hébergement
// (gate côté appelant, `poi-popup.tsx`). La sélection de variante est **liftée à l'écran
// carte** (MOB-4.7 réutilisera le même index pour la polyline).

interface AccessMetricsProps {
  poiId: string;
  origin: AccessOrigin;
  category: PoiCategory | null;
  /** Variante sélectionnée (état détenu par l'écran carte, partagé avec la polyline 4.7). */
  selectedVariantIndex?: number;
  onSelectVariant?: (index: number) => void;
}

export function AccessMetrics({
  poiId,
  origin,
  category,
  selectedVariantIndex = 0,
  onSelectVariant,
}: AccessMetricsProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const { isOnline } = useNetworkStatus();
  const { data, isLoading, fetchStatus } = useAccess(poiId, origin);

  // Guard anti-skeleton-infini hors-ligne (règle AGENTS.md §Data mobile) : hors-ligne sans
  // cache, `isLoading` reste vrai indéfiniment (`fetchStatus: 'paused'`). On ne montre le
  // skeleton que pendant un fetch réel, pas une pause réseau.
  if (isLoading && fetchStatus !== 'paused') return <AccessMetricsSkeleton />;

  // Un `ok`/`fallback` déjà en cache reste exploitable même si un refetch échoue ensuite
  // (TanStack conserve `data`). On ne bascule sur l'indispo que faute de donnée utilisable.
  const usableData = data && data.status !== 'error' ? data : null;

  if (!usableData) {
    // Hors-ligne sans cache (AC6) : message dédié non bloquant — le reste de la fiche
    // (nom/type/distance + booking) reste fonctionnel. En ligne : indispo générique.
    const messageKey = !isOnline ? 'pois.access.offline' : 'pois.access.unavailable';
    return (
      <Text
        className="text-xs font-montserrat text-text-muted"
        testID="access-unavailable"
      >
        {t(messageKey)}
      </Text>
    );
  }

  if (usableData.status === 'fallback') {
    return <AccessFallback fallbackDistanceM={usableData.fallbackDistanceM} />;
  }

  // status === 'ok' — on affiche la variante SÉLECTIONNÉE (l'utilisateur peut en changer).
  const variants = usableData.variants;
  // Garde défensive : Zod garantit variants ≥ 1 pour status ok, mais évite le crash
  // `variants[-1]` si un serveur non conforme envoie un tableau vide.
  if (!variants.length) return null;
  const sel = Math.min(Math.max(selectedVariantIndex, 0), variants.length - 1);
  const active = variants[sel];

  return (
    <View className="gap-2" testID="access-metrics">
      <Text className="text-sm font-montserrat-semibold text-text-primary">
        {t(getAccessLabelKey(category))}
      </Text>
      <View className="flex-row items-center gap-4">
        <Text className="text-sm font-montserrat-medium text-text-primary">
          {formatAccessDistance(active.distanceM, locale)}
        </Text>
        <View className="flex-row items-center gap-1">
          <TrendingUpIcon size={16} className="text-primary" />
          <Text className="text-sm font-montserrat text-text-secondary">
            {formatAccessElevation(active.elevationGainM, locale)} D+
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <TrendingDownIcon size={16} className="text-primary" />
          <Text className="text-sm font-montserrat text-text-secondary">
            {formatAccessElevation(active.elevationLossM, locale)} D-
          </Text>
        </View>
      </View>
      <VariantSelector
        variants={variants}
        selected={sel}
        onSelect={onSelectVariant}
      />
    </View>
  );
}
