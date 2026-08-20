import { Text, View } from 'react-native';

import { useTranslation } from '@/lib/i18n';

// Dit ce que le filtre corridor a écarté. Parité web `near-miss-notice.tsx`.
//
// Le filtre est correct — il garde l'affichage cohérent avec le couloir annoncé, indépendamment
// de la forme du rectangle de recherche. Ce qui ne l'était pas, c'est qu'il coupait **en
// silence** : un camping à 3 263 m a été écarté pour 263 m, l'écran affichait « Camping (0) »,
// et rien ne permettait de distinguer « il n'y a rien » de « il y a quelque chose juste au-delà
// de la limite ». Même forme de défaut que la panne Overpass restée invisible cinq mois.
//
// Purement informatif : n'ajoute aucun POI et ne change rien à ce qui est rendu sur la carte.

/** Formate une distance en mètres → « 3,3 km » ou « 800 m ». Locale-aware. */
export function formatNearMissDistance(meters: number, locale: string): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(meters / 1000)} km`;
}

export interface NearMissNoticeProps {
  /** Nombre de POI écartés par le filtre corridor, dans la bande signalée. */
  count: number;
  /** Distance du plus proche des masqués. */
  nearestM: number | null;
  /** Seuil d'affichage effectif, renvoyé par le serveur. */
  corridorWidthM: number;
}

export function NearMissNotice({ count, nearestM, corridorWidthM }: NearMissNoticeProps) {
  const { t, i18n } = useTranslation();
  if (count <= 0) return null;

  const locale = i18n.language;
  const corridor = formatNearMissDistance(corridorWidthM, locale);
  const main = t(count === 1 ? 'pois.search.nearMissOne' : 'pois.search.nearMissMany', {
    count,
    corridor,
  });
  const nearest =
    nearestM !== null
      ? t('pois.search.nearMissNearest', {
          distance: formatNearMissDistance(nearestM, locale),
        })
      : null;

  return (
    <View accessibilityRole="summary" className="mt-1">
      <Text className="text-xs font-montserrat text-text-secondary">
        {nearest ? `${main} — ${nearest}.` : `${main}.`}
      </Text>
    </View>
  );
}
