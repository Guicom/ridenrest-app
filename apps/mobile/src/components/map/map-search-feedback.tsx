import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';
import { XIcon } from '@/components/ui/icon';
import { useTranslation } from '@/lib/i18n';

// Retours de recherche corridor (MOB-4.3 / T4, AC2-4). Composant **présentiel pur**
// (piloté par flags) — testable hors carte. Rendu superposé **scopé à la zone carte**
// (jamais plein écran bloquant, jamais `Alert.alert`).
//
// Précédence : `isFetching` (overlay) → `isError` (ErrorBanner + relance) →
// `isEmpty` (bannière « Aucun résultat », dismissable AC3).

export interface MapSearchFeedbackProps {
  /** Requête réseau en vol → overlay de chargement. */
  isFetching: boolean;
  /** Recherche committée terminée sans POI → bannière « Aucun résultat ». */
  isEmpty: boolean;
  /** Erreur réseau → ErrorBanner + relance. */
  isError: boolean;
  /** Relance « Rechercher » depuis l'ErrorBanner. */
  onRetry?: () => void;
}

export function MapSearchFeedback({
  isFetching,
  isEmpty,
  isError,
  onRetry,
}: MapSearchFeedbackProps) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);
  const [lastIsEmpty, setLastIsEmpty] = useState(isEmpty);
  if (isEmpty !== lastIsEmpty) {
    setLastIsEmpty(isEmpty);
    if (isEmpty) setDismissed(false);
  }

  // Overlay de chargement scopé carte — voile léger + indicateur, non bloquant.
  if (isFetching) {
    return (
      <View
        pointerEvents="none"
        className="absolute inset-0 z-20 items-center justify-center"
      >
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={t('pois.search.loading')}
          className="flex-row items-center gap-2 rounded-lg bg-card/90 px-4 py-3"
        >
          <ActivityIndicator size="small" className="text-primary" />
          <Text className="text-sm font-montserrat text-text-primary">
            {t('pois.search.loading')}
          </Text>
        </View>
      </View>
    );
  }

  // Erreur réseau prioritaire sur « aucun résultat » (distinct, AC4).
  if (isError) {
    return (
      <View
        pointerEvents="box-none"
        style={{ bottom: 96 }}
        className="absolute left-4 right-4 z-30 items-center gap-2"
      >
        <ErrorBanner message={t('pois.search.error')} />
        {onRetry ? (
          <Button
            variant="outline"
            size="sm"
            className="bg-card/90"
            label={t('pois.search.button')}
            onPress={onRetry}
          />
        ) : null}
      </View>
    );
  }

  // « Aucun résultat » — bannière scopée carte, distincte d'une erreur, dismissable (AC3).
  if (isEmpty && !dismissed) {
    return (
      <View
        pointerEvents="box-none"
        style={{ bottom: 96 }}
        className="absolute left-4 right-4 z-30 items-center"
      >
        <View
          accessibilityRole="alert"
          className="flex-row items-center gap-2 rounded-lg bg-orange-500/90 px-4 py-2"
        >
          <Text className="flex-1 text-center text-sm font-montserrat text-white">
            {t('pois.search.noResults')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('pois.search.dismissNoResults')}
            onPress={() => setDismissed(true)}
            hitSlop={8}
          >
            <XIcon size={16} className="text-white" />
          </Pressable>
        </View>
      </View>
    );
  }

  return null;
}
