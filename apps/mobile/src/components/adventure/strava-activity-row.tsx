import { Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { StravaRouteItem } from '@/hooks/use-strava';
import { formatKm } from '@/lib/format/distance';
import { useTranslation } from '@/lib/i18n';

// Ligne d'un itinéraire (route) Strava dans la sheet d'import (MOB-3.4 / AC2, AC6).
// Affiche nom + distance (séparateur décimal localisé via `formatKm`) + D+ si connu,
// et un bouton « Importer » qui se désactive pendant l'import (anti-double-submit).
//
// Le libellé affiché parle d'« itinéraires » (routes planifiées), jamais d'activités
// (le nom de fichier reste `strava-activity-row` par cohérence avec l'intitulé epic).

export interface StravaActivityRowProps {
  route: StravaRouteItem;
  /** Déclenche l'import de cette route. */
  onImport: () => void;
  /** `true` si CETTE ligne est en cours d'import (loading + désactivé). */
  importing: boolean;
  /** `true` si un AUTRE import est en cours (ligne grisée, non actionnable). */
  disabled: boolean;
}

export function StravaActivityRow({
  route,
  onImport,
  importing,
  disabled,
}: StravaActivityRowProps) {
  const { t, i18n } = useTranslation();

  const distanceLabel = t('strava.import.distance', {
    value: formatKm(route.distanceKm, i18n.language),
  });
  const elevationLabel =
    route.elevationGainM != null
      ? t('strava.import.elevation', { value: Math.round(route.elevationGainM) })
      : null;

  // Libellé a11y consolidé (nom + distance) pour la ligne entière.
  const accessibilityLabel = `${route.name}, ${distanceLabel}`;

  return (
    <Card
      accessibilityRole="summary"
      accessibilityLabel={accessibilityLabel}
      className="flex-row items-center justify-between gap-3"
    >
      <View className="flex-1">
        <Text
          className="text-base font-montserrat-semibold text-card-foreground"
          numberOfLines={1}
        >
          {route.name}
        </Text>
        <View className="mt-1 flex-row items-center gap-3">
          <Text className="text-sm font-montserrat text-text-muted">
            {distanceLabel}
          </Text>
          {elevationLabel ? (
            <Text className="text-sm font-montserrat text-text-muted">
              {elevationLabel}
            </Text>
          ) : null}
        </View>
      </View>

      <Button
        size="sm"
        // ≥ 44px de cible tactile : `min-w` garantit la largeur ; `sm` fait 36px de
        // haut → on rehausse à 44 pour la conformité HIG/WCAG.
        className="h-11 min-w-[44px]"
        label={
          importing ? t('strava.import.importing') : t('strava.import.importButton')
        }
        loading={importing}
        disabled={disabled || importing}
        onPress={onImport}
      />
    </Card>
  );
}
