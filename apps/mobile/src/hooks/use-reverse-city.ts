import { useQuery } from '@tanstack/react-query';

import { getReverseCity } from '@/lib/api/geo';
import { useNetworkStatus } from '@/hooks/use-network-status';

// Reverse-geocoding du centre de corridor → ville (pour les URLs Booking.com). Port iso
// du web. Clé arrondie à 3 décimales (~110 m) pour maximiser le cache (données stables,
// `staleTime`/`gcTime` 7j). Gate `enabled` : seulement avec un centre + en ligne.

export function useReverseCity(center: { lat: number; lng: number } | null) {
  const { isOnline } = useNetworkStatus();
  const lat = center?.lat ?? null;
  const lng = center?.lng ?? null;
  const roundedKey =
    lat != null && lng != null ? `${lat.toFixed(3)},${lng.toFixed(3)}` : null;

  const query = useQuery({
    queryKey: ['reverseCity', roundedKey],
    queryFn: () => getReverseCity(lat!, lng!),
    enabled: roundedKey != null && isOnline,
    staleTime: 7 * 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
  });

  return { city: query.data?.city ?? null, ...query };
}
