import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { TriangleAlertIcon } from '@/components/ui/icon';
import { useTranslation } from '@/lib/i18n';

// Statut discret de la recherche étendue (Overpass), affiché PENDANT que les résultats
// Google sont déjà sur la carte. Parité web `extended-search-status.tsx`.
//
// Raison d'être : Overpass a été mesuré entre 1 s et 31 s sur les instances publiques, avec
// des 504 et des instances mortes. Faire attendre l'utilisateur derrière n'a aucun intérêt —
// mais le laisser sans explication devant une carte qui se complète toute seule (ou qui reste
// partielle) est pire. C'est ce silence qui a laissé une panne Overpass de 5 mois passer
// inaperçue.
//
// **Non bloquant** : `pointerEvents="none"`, l'utilisateur continue de naviguer, zoomer et
// ouvrir des POI. En Live c'est indispensable — il roule.

/** Au-delà de ce délai, on prévient que la recherche étendue traîne. */
export const SLOW_THRESHOLD_MS = 5000;

export interface ExtendedSearchStatusProps {
  /** La recherche étendue est en vol. */
  pending: boolean;
  /** Elle a échoué : les résultats affichés sont partiels (≠ recherche en erreur). */
  error: boolean;
  /** Décalage vertical dans le conteneur carte (px). */
  bottom?: number;
  /**
   * Délai avant le message « plus longue que prévu ». Injectable pour que les tests n'aient
   * pas à manipuler de faux timers — sous `jest.useFakeTimers()`, le `await render` de RNTL
   * v14 ne se résout jamais.
   */
  slowThresholdMs?: number;
}

export function ExtendedSearchStatus({
  pending,
  error,
  bottom = 96,
  slowThresholdMs = SLOW_THRESHOLD_MS,
}: ExtendedSearchStatusProps) {
  const { t } = useTranslation();
  const [isSlow, setIsSlow] = useState(false);

  // Réinitialisation en phase de RENDU (idiome déjà utilisé dans `map-search-feedback.tsx`) :
  // un `setState` synchrone dans le corps d'un effet est interdit par `set-state-in-effect`,
  // et provoquerait de toute façon un rendu supplémentaire inutile.
  const [lastPending, setLastPending] = useState(pending);
  if (pending !== lastPending) {
    setLastPending(pending);
    if (!pending) setIsSlow(false);
  }

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setIsSlow(true), slowThresholdMs);
    return () => clearTimeout(timer);
  }, [pending, slowThresholdMs]);

  if (!pending && !error) return null;

  // L'erreur prime : annoncer « en cours » alors que la source est tombée serait faux.
  if (error) {
    return (
      <View
        pointerEvents="none"
        style={{ bottom }}
        className="absolute left-4 right-4 z-30 items-center"
      >
        <View
          accessibilityRole="alert"
          className="flex-row items-center gap-2 rounded-lg bg-orange-500/90 px-3 py-1.5"
        >
          <TriangleAlertIcon size={14} className="text-white" />
          <Text className="text-xs font-montserrat text-white">
            {t('pois.search.extendedError')}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View
      pointerEvents="none"
      style={{ bottom }}
      className="absolute left-4 right-4 z-30 items-center"
    >
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={t('pois.search.extendedPending')}
        className="flex-row items-center gap-2 rounded-lg bg-card/90 px-3 py-1.5"
      >
        <ActivityIndicator size="small" className="text-primary" />
        <Text className="text-xs font-montserrat text-text-primary">
          {isSlow ? t('pois.search.extendedSlow') : t('pois.search.extendedPending')}
        </Text>
      </View>
    </View>
  );
}
