import { View } from 'react-native';

import { Skeleton } from '@/components/ui/skeleton';

// Skeleton DÉDIÉ au chargement des métriques d'accès (MOB-4.6 / T4, AC2 — FR-PA-018).
// JAMAIS un `<ActivityIndicator>` générique : règle projet « Loading States » (toujours
// un `<Skeleton />`). Reflète le rendu final de `AccessMetrics` (variante `full`) :
// libellé (h-5) + ligne distance / D+ / D- (h-4).

export function AccessMetricsSkeleton() {
  return (
    <View className="gap-2" testID="access-metrics-skeleton">
      <Skeleton className="h-5 w-40" />
      <View className="flex-row items-center gap-4">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-4 w-14" />
      </View>
    </View>
  );
}
