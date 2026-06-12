import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@ridenrest/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';
import { TextField } from '@/components/ui/text-field';
import { authClient } from '@/lib/auth/client';
import { useTranslation } from '@/lib/i18n';

// Écran de réinitialisation du mot de passe (MOB-2.2 / AC3, AC4 — FR-007).
//
// OPTION A (cf. story Dev Notes §Flow reset mobile) : le mobile ne fait qu'INITIER
// l'envoi du mail ; `redirectTo` pointe vers la page web de reset existante
// (`apps/web/.../reset-password`) où l'utilisateur saisit son nouveau mot de passe.
// Backend 100 % inchangé. La saisie mobile du nouveau mdp (Option B, deep link) est
// hors périmètre de cette story.
//
// `WEB_URL` = origine du site web (= serveur Better Auth, même origine). Surchargée
// par `EXPO_PUBLIC_WEB_URL` en prod si le web a un domaine distinct du auth server.
const WEB_URL =
  process.env.EXPO_PUBLIC_WEB_URL ??
  process.env.EXPO_PUBLIC_BETTER_AUTH_URL ??
  'http://localhost:3011';

export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  // Anti-énumération (AC3) : message neutre affiché en cas de succès ET d'échec
  // APPLICATIF (compte inexistant, erreur serveur) — on ne révèle jamais si un compte
  // existe pour cette adresse.
  const [sent, setSent] = useState(false);
  // Échec RÉSEAU (offline/timeout) : rien n'a été envoyé → afficher un message neutre
  // « envoyé » serait mensonger. Une erreur réseau ne révèle PAS l'existence du compte,
  // donc l'afficher ne casse pas l'anti-énumération.
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: ForgotPasswordInput) => {
    setAuthError(null);
    try {
      // On ignore délibérément l'`error` retourné : succès ou échec applicatif → même
      // message neutre (AC3). Seul un REJET (réseau) est traité à part ci-dessous.
      await authClient.requestPasswordReset({
        email: values.email,
        redirectTo: `${WEB_URL}/reset-password`,
      });
      setSent(true);
    } catch {
      setAuthError(t('auth.errors.network'));
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background-page"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerClassName="flex-grow justify-center gap-6 p-6"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-2">
          <Text className="text-2xl font-montserrat-bold text-text-primary">
            {t('auth.reset.title')}
          </Text>
          <Text className="text-sm font-montserrat text-text-muted">
            {t('auth.reset.subtitle')}
          </Text>
        </View>

        {sent ? (
          <View
            accessibilityRole="alert"
            className="gap-2 rounded-xl border border-border bg-card p-4"
          >
            <Text className="font-montserrat-semibold text-card-foreground">
              {t('auth.reset.neutralTitle')}
            </Text>
            <Text className="text-sm font-montserrat text-text-muted">
              {t('auth.reset.neutralMessage')}
            </Text>
          </View>
        ) : (
          <View className="gap-4">
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label={t('auth.common.emailLabel')}
                  placeholder={t('auth.common.emailPlaceholder')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.email ? t(errors.email.message ?? '') : undefined}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="go"
                  onSubmitEditing={handleSubmit(onSubmit)}
                />
              )}
            />

            {authError ? <ErrorBanner message={authError} /> : null}

            <Button
              size="lg"
              className="w-full"
              loading={isSubmitting}
              label={
                isSubmitting ? t('auth.reset.submitting') : t('auth.reset.submit')
              }
              onPress={handleSubmit(onSubmit)}
            />
          </View>
        )}

        <Button
          variant="link"
          size="sm"
          className="self-center px-0"
          label={t('auth.reset.backToLogin')}
          onPress={() => router.replace('/(auth)/login')}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
