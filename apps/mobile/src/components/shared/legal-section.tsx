import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  ExternalLinkIcon,
  FileTextIcon,
  ShieldIcon,
} from '@/components/ui/icon';
import { openExternalUrl } from '@/lib/external-links';
import { useTranslation } from '@/lib/i18n';

// Section « Légal » des Paramètres (MOB-6.4 / AC3). N'affiche QUE des liens vers les
// pages légales web (aucun contenu légal dupliqué en natif → conforme AC3 + guideline
// App Store 4.2). L'ouverture passe par `openExternalUrl` (navigateur système, jamais
// une WebView embarquée) ; tout échec est capturé et signalé de façon **non bloquante**
// (le reste des paramètres reste utilisable).

// URLs légales publiques — routes web `(marketing)` créées par cette même story (T0).
export const PRIVACY_URL = 'https://ridenrest.app/privacy';
export const TERMS_URL = 'https://ridenrest.app/terms';

export function LegalSection() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [openError, setOpenError] = useState(false);

  const handleOpen = async (url: string) => {
    if (loading) return;
    setLoading(true);
    setOpenError(false);
    try {
      const res = await openExternalUrl(url);
      // `openExternalUrl` ne throw jamais → on lit `ok` et on affiche un feedback discret.
      if (!res.ok) setOpenError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="gap-3">
      <Text className="px-1 text-xs font-montserrat-semibold uppercase text-text-muted">
        {t('settings.legalSection')}
      </Text>
      <Card>
        <CardContent className="gap-2">
          <Button
            variant="outline"
            size="lg"
            className="justify-between"
            testID="legal-privacy"
            accessibilityLabel={t('settings.legal.privacyPolicy')}
            accessibilityHint={t('settings.legal.openInBrowser')}
            disabled={loading}
            onPress={() => {
              void handleOpen(PRIVACY_URL);
            }}
          >
            <View className="flex-row items-center gap-3">
              <ShieldIcon size={18} className="text-text-secondary" />
              <Text className="text-sm font-montserrat-semibold text-foreground">
                {t('settings.legal.privacyPolicy')}
              </Text>
            </View>
            <ExternalLinkIcon size={16} className="text-text-muted" />
          </Button>

          <Button
            variant="outline"
            size="lg"
            className="justify-between"
            testID="legal-terms"
            accessibilityLabel={t('settings.legal.terms')}
            accessibilityHint={t('settings.legal.openInBrowser')}
            disabled={loading}
            onPress={() => {
              void handleOpen(TERMS_URL);
            }}
          >
            <View className="flex-row items-center gap-3">
              <FileTextIcon size={18} className="text-text-secondary" />
              <Text className="text-sm font-montserrat-semibold text-foreground">
                {t('settings.legal.terms')}
              </Text>
            </View>
            <ExternalLinkIcon size={16} className="text-text-muted" />
          </Button>

          {openError ? (
            <Text
              accessibilityRole="alert"
              className="px-1 text-xs font-montserrat text-destructive"
            >
              {t('settings.legal.openError')}
            </Text>
          ) : null}
        </CardContent>
      </Card>
    </View>
  );
}
