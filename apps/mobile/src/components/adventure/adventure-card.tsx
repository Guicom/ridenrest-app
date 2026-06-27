import type { AdventureResponse } from '@ridenrest/shared';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { PoweredByStrava } from '@/components/shared/powered-by-strava';
import { useTranslation } from '@/lib/i18n';

// Carte d'aventure (MOB-3.1 / AC1) — portage À L'IDENTIQUE de la carte web mobile
// (`apps/web/.../adventure-card.tsx`, < lg, décision UX-DR-MOB-001). On reproduit
// les classes web une à une (pas via le primitif Button, pour garder exactement
// les couleurs/dimensions) :
//   - conteneur `bg-card rounded-xl border p-4` ;
//   - en-tête : nom (gauche) + colonne métriques (distance, dénivelé ↑/↓, wordmark
//     « Powered by Strava ») ;
//   - ligne date (plage / start / créa) ;
//   - actions : « Démarrer en Live » (pleine largeur, `bg-text-primary`/blanc) puis
//     « Planning » (`bg-surface-raised`) + « Modifier » (bordure).
//
// « Planning » (carte MOB-4.1) navigue vers `map/[id]`. « Démarrer en Live » (MOB-5.1)
// navigue désormais vers `live/[id]` (consentement RGPD → permission → suivi GPS).
// « Modifier » → détail `[id]` (renommage/suppression, parité web). Le corps navigue
// aussi au détail.

export interface AdventureCardProps {
  adventure: AdventureResponse;
  /** Navigation vers le détail `[id]` (corps de carte + bouton « Modifier »). */
  onPress: (id: string) => void;
}

function formatDistance(km: number): string {
  return km > 0 ? `${km.toFixed(1)} km` : '—';
}

/** `'YYYY-MM-DD'` → date locale (minuit local, évite le décalage d'un jour en UTC-). */
function parseLocalDate(d: string): Date {
  return new Date(`${d}T00:00:00`);
}

export function AdventureCard({ adventure, onPress }: AdventureCardProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const fmtDate = (d: Date) => d.toLocaleDateString(locale);

  const dateLabel = adventure.startDate
    ? adventure.endDate
      ? `${fmtDate(parseLocalDate(adventure.startDate))} → ${fmtDate(parseLocalDate(adventure.endDate))}`
      : fmtDate(parseLocalDate(adventure.startDate))
    : fmtDate(new Date(adventure.createdAt));

  const gain = adventure.totalElevationGainM;
  const loss = adventure.totalElevationLossM;
  const elevationLabel =
    gain != null && gain > 0
      ? `↑ ${Math.round(gain).toLocaleString(locale)} m${
          loss != null && loss > 0
            ? ` · ↓ ${Math.round(loss).toLocaleString(locale)} m`
            : ''
        }`
      : null;

  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-4">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('adventures.card.openA11y')}
        className="gap-1 active:opacity-70"
        onPress={() => onPress(adventure.id)}
      >
        <View className="flex-row items-start justify-between gap-3">
          <Text
            numberOfLines={2}
            className="flex-1 text-base font-montserrat-semibold text-text-primary"
          >
            {adventure.name}
          </Text>
          <View className="items-end gap-0.5">
            <Text className="text-sm font-montserrat text-text-secondary">
              {formatDistance(adventure.totalDistanceKm)}
            </Text>
            {elevationLabel ? (
              <Text className="text-sm font-montserrat text-text-secondary">
                {elevationLabel}
              </Text>
            ) : null}
            {adventure.hasStravaSegment ? (
              <View className="mt-0.5">
                <PoweredByStrava />
              </View>
            ) : null}
          </View>
        </View>
        <Text className="text-sm font-montserrat text-text-muted">{dateLabel}</Text>
      </Pressable>

      {/* « Démarrer en Live » — actif (MOB-5.1) → écran Live (consentement → GPS). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('adventures.card.live')}
        className="w-full items-center justify-center rounded-lg bg-text-primary py-3 active:opacity-70"
        onPress={() => router.push(`/(app)/live/${adventure.id}`)}
      >
        <Text className="text-sm font-montserrat-semibold text-white">
          {t('adventures.card.live')}
        </Text>
      </Pressable>

      <View className="flex-row gap-2">
        {/* « Planning » — actif (MOB-4.1) → carte interactive de l'aventure. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('adventures.card.planning')}
          className="flex-1 items-center justify-center rounded-lg bg-surface-raised py-3 active:opacity-70"
          onPress={() => router.push(`/(app)/map/${adventure.id}`)}
        >
          <Text className="text-sm font-montserrat-semibold text-text-primary">
            {t('adventures.card.planning')}
          </Text>
        </Pressable>
        {/* « Modifier » — actif → détail. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('adventures.card.edit')}
          className="flex-1 items-center justify-center rounded-lg border border-border bg-background py-3 active:bg-surface-raised"
          onPress={() => onPress(adventure.id)}
        >
          <Text className="text-sm font-montserrat-semibold text-text-primary">
            {t('adventures.card.edit')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
