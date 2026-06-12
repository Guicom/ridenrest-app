import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ErrorBanner } from '@/components/ui/error-banner';
import { Skeleton } from '@/components/ui/skeleton';
import {
  StravaLinkCancelledError,
  useStravaConnection,
} from '@/hooks/use-strava-connection';
import { cn } from '@/lib/cn';
import { useTranslation } from '@/lib/i18n';

// Carte « Intégration Strava » des Paramètres (MOB-2.4 / AC2, AC3). Strava est de
// l'**account-linking** : l'utilisateur est déjà connecté (route `(app)` gardée) et
// lie/délie une intégration — jamais un sign-in (cf. Dev Notes story).
//
// L'état (connecté/non connecté), le linking (`oauth2.link`) et la déliaison
// (`unlinkAccount`) sont portés par `useStravaConnection`. Cette carte gère
// uniquement la présentation + le feedback d'erreur in-page (`<ErrorBanner />`,
// jamais `Alert.alert`). Elle possède son propre `<Card>` (encapsulation) — l'écran
// hôte ne la re-wrappe donc PAS dans une autre Card (cf. project-context).

export interface StravaConnectionCardProps {
  className?: string;
}

export function StravaConnectionCard({ className }: StravaConnectionCardProps) {
  const { t } = useTranslation();
  const {
    isConnected,
    isLoading,
    isError,
    isConnecting,
    isDisconnecting,
    connect,
    disconnect,
  } = useStravaConnection();
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setError(null);
    try {
      await connect();
    } catch (e) {
      // `oauth2.link` résout aussi sur annulation : le hook distingue « annulé »
      // (aucune liaison) d'un échec réseau. Aucun état partiel dans les deux cas.
      setError(
        e instanceof StravaLinkCancelledError
          ? t('auth.strava.errors.cancelled')
          : t('auth.strava.errors.connectFailed'),
      );
    }
  };

  const handleDisconnect = async () => {
    setError(null);
    try {
      await disconnect();
    } catch {
      setError(t('auth.strava.errors.disconnectFailed'));
    }
  };

  // Échec de lecture de l'état : on n'affiche ni « connecté » ni « non connecté »
  // (qui seraient mensongers) — un message dédié, et le bouton connect reste
  // disponible (un tap réussi invalidera la query).
  const statusLabel = isError
    ? t('auth.strava.errors.loadFailed')
    : isConnected
      ? t('auth.strava.connected')
      : t('auth.strava.notConnected');

  return (
    <Card className={cn('w-full', className)}>
      <CardContent>
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1 gap-1">
            <Text className="text-base font-montserrat-semibold text-card-foreground">
              {t('auth.strava.title')}
            </Text>
            {isLoading ? (
              <Skeleton testID="strava-status-skeleton" className="h-4 w-32" />
            ) : (
              <Text className="text-sm font-montserrat text-text-muted">
                {statusLabel}
              </Text>
            )}
          </View>

          {!isLoading &&
            (isConnected ? (
              <Button
                variant="outline"
                size="sm"
                loading={isDisconnecting}
                onPress={handleDisconnect}
                label={
                  isDisconnecting
                    ? t('auth.strava.disconnecting')
                    : t('auth.strava.disconnect')
                }
                accessibilityLabel={t('auth.strava.disconnect')}
              />
            ) : (
              <Button
                size="sm"
                loading={isConnecting}
                onPress={handleConnect}
                label={
                  isConnecting
                    ? t('auth.strava.connecting')
                    : t('auth.strava.connect')
                }
                accessibilityLabel={t('auth.strava.connect')}
              />
            ))}
        </View>

        {error ? <ErrorBanner message={error} className="mt-3" /> : null}
      </CardContent>
    </Card>
  );
}
