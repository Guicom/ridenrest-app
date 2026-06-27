import { Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';

// Dialog de consentement géolocalisation Live (MOB-5.1 / T4) — port du web
// `geolocation-consent.tsx`.
//
// ⚠️ **Overlay RN absolu, PAS un RN `Modal`** (déviation assumée vs « via Dialog mobile »).
// Raison : sur iOS le contenu d'un `<Modal>` est rendu dans une **fenêtre séparée** que
// XCUITest/Maestro n'introspecte pas (la hiérarchie ne voit que la barre de statut → le
// flow device ne peut ni asserter ni taper le dialog). C'est le **même pattern iOS** que
// la fiche POI (refonte 2026-06-27, cf. AGENTS.md) : contenu interactif au-dessus de la
// carte = `<View>` absolue sœur, pas un Modal/Marker. Bonus : taps fiables + a11y lisible.
//
// **Non-dismissible** (gate RGPD, FR-040 / NFR-013) : le fond assombri est une `<View>`
// **inerte** (aucun `onPress`/Pressable) → un tap hors de la carte ne ferme PAS ; pas de ✕.
// Seules les actions explicites « Activer » (→ `onConsent`) / « Refuser » (→ `onDismiss`,
// Live non activé + message AC1) sortent du dialog. Boutons `size="lg"` (cible 44px).
// `accessibilityViewIsModal` piège le focus VoiceOver sur la carte. Texte 100% i18n.

export interface GeolocationConsentProps {
  open: boolean;
  /** Clic « Activer » → consentement accordé + flow permission OS. */
  onConsent: () => void;
  /** Clic « Refuser » → ferme, Live non activé (l'écran affiche le message AC1). */
  onDismiss: () => void;
}

export function GeolocationConsent({
  open,
  onConsent,
  onDismiss,
}: GeolocationConsentProps) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <View
      accessibilityViewIsModal
      className="absolute inset-0 z-50 items-center justify-center bg-black/40 px-6"
    >
      <View className="w-full max-w-md rounded-2xl border border-border bg-card p-5">
        <Text className="mb-3 text-lg font-montserrat-semibold text-text-primary">
          {t('live.consent.title')}
        </Text>
        <View className="gap-3">
          <Text className="text-sm font-montserrat text-text-secondary">
            {t('live.consent.body')}
          </Text>
          <Text className="text-xs font-montserrat text-text-muted">
            {t('live.consent.rgpd')}
          </Text>
        </View>
        <View className="mt-5 flex-row justify-end gap-2">
          <Button
            variant="ghost"
            size="lg"
            label={t('live.consent.refuse')}
            onPress={onDismiss}
          />
          <Button
            size="lg"
            label={t('live.consent.accept')}
            onPress={onConsent}
          />
        </View>
      </View>
    </View>
  );
}
