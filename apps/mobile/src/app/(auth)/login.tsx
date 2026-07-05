import { zodResolver } from '@hookform/resolvers/zod';
import { signInSchema, type SignInInput } from '@ridenrest/shared';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  type TextInput,
  View,
} from 'react-native';

import { GoogleSignInButton } from '@/components/shared/google-sign-in-button';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';
import { TextField } from '@/components/ui/text-field';
import { authClient } from '@/lib/auth/client';
import { useTranslation } from '@/lib/i18n';

// Écran de connexion email/mot de passe (MOB-2.2 / AC2, AC4) — remplace le
// placeholder MOB-2.1. RHF + zodResolver(signInSchema) partagé. Anti-énumération :
// toute erreur d'identifiants → message GÉNÉRIQUE (jamais « email inexistant »).
// Slot OAuth (« Continuer avec Google ») réservé visuellement → flow en MOB-2.3.
export default function LoginScreen() {
  const { t } = useTranslation();
  const [authError, setAuthError] = useState<string | null>(null);
  // Focus-advance : la touche « Next » du champ email passe au mot de passe.
  const passwordRef = useRef<TextInput>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: SignInInput) => {
    setAuthError(null);
    try {
      const { data, error } = await authClient.signIn.email({
        email: values.email,
        password: values.password,
      });

      if (error) {
        // Anti-énumération (AC2) : les erreurs d'AUTHENTIFICATION restent génériques
        // (ne distinguent PAS email inexistant / mauvais mdp). En revanche on NE masque
        // PAS les pannes non liées aux identifiants (rate-limit, serveur) en « mdp faux »
        // — ce qui induirait l'utilisateur en erreur (décision revue MOB-2.2 / D1).
        const status = (error as { status?: number }).status ?? 0;
        if (status === 429) {
          setAuthError(t('auth.errors.tooManyRequests'));
        } else if (status >= 500) {
          setAuthError(t('auth.errors.serverError'));
        } else {
          setAuthError(t('auth.errors.invalidCredentials'));
        }
        return;
      }

      if (data) {
        router.replace('/(app)/adventures');
        return;
      }

      // Réponse résolue sans `data` ni `error` (corps vide/204) : éviter l'impasse
      // silencieuse (bouton réactivé, aucun feedback) → message générique.
      setAuthError(t('auth.errors.generic'));
    } catch {
      // Rejet réseau (offline/timeout) : non converti en `{ error }` côté client.
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
            {t('auth.login.title')}
          </Text>
          <Text className="text-sm font-montserrat text-text-muted">
            {t('auth.login.subtitle')}
          </Text>
        </View>

        {/* OAuth Google (MOB-2.3) — flow server-mediated `signIn.social`. */}
        <GoogleSignInButton />

        <View className="flex-row items-center gap-3">
          <View className="h-px flex-1 bg-border" />
          <Text className="text-xs font-montserrat uppercase text-text-muted">
            {t('auth.login.orContinueWith')}
          </Text>
          <View className="h-px flex-1 bg-border" />
        </View>

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
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
            )}
          />

          <View className="gap-1.5">
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  ref={passwordRef}
                  label={t('auth.common.passwordLabel')}
                  placeholder={t('auth.common.passwordPlaceholder')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={
                    errors.password ? t(errors.password.message ?? '') : undefined
                  }
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="current-password"
                  textContentType="password"
                  returnKeyType="go"
                  onSubmitEditing={handleSubmit(onSubmit)}
                />
              )}
            />
            <Button
              variant="link"
              size="sm"
              className="self-end px-0"
              textClassName="text-xs"
              label={t('auth.login.forgotPassword')}
              onPress={() => router.push('/(auth)/reset-password')}
            />
          </View>

          {authError ? <ErrorBanner message={authError} /> : null}

          <Button
            size="lg"
            className="w-full"
            loading={isSubmitting}
            label={
              isSubmitting ? t('auth.login.submitting') : t('auth.login.submit')
            }
            onPress={handleSubmit(onSubmit)}
          />
        </View>

        <View className="flex-row items-center justify-center gap-1">
          <Text className="text-sm font-montserrat text-text-muted">
            {t('auth.login.noAccount')}
          </Text>
          <Button
            variant="link"
            size="sm"
            className="px-0"
            label={t('auth.login.signupLink')}
            onPress={() => router.push('/(auth)/signup')}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
