import { zodResolver } from '@hookform/resolvers/zod';
import { signUpSchema, type SignUpInput } from '@ridenrest/shared';
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

// Écran d'inscription email/mot de passe (MOB-2.2 / AC1, AC4).
// RHF + zodResolver(signUpSchema) — schéma PARTAGÉ (`@ridenrest/shared`), jamais
// dupliqué. Succès = session établie en secure-store (MOB-2.1) → `(app)/adventures`.
export default function SignUpScreen() {
  const { t } = useTranslation();
  const [authError, setAuthError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  // Focus-advance : la touche « Next » du champ email passe au mot de passe.
  const passwordRef = useRef<TextInput>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: SignUpInput) => {
    setAuthError(null);
    // `name` est requis par Better Auth ; au MVP on le dérive de l'email
    // (partie locale). L'utilisateur pourra l'éditer dans son profil (MOB-2.5).
    const derivedName = values.email.split('@')[0] || values.email;

    try {
      const { data, error } = await authClient.signUp.email({
        name: derivedName,
        email: values.email,
        password: values.password,
      });

      if (error) {
        // On ne montre jamais le message brut serveur ; on mappe vers une clé i18n.
        setAuthError(
          error.code === 'USER_ALREADY_EXISTS'
            ? t('auth.errors.emailTaken')
            : t('auth.errors.generic'),
        );
        return;
      }

      if (data) {
        router.replace('/(app)/adventures');
        return;
      }

      // Réponse résolue sans `data` ni `error` : éviter l'impasse silencieuse.
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
            {t('auth.signup.title')}
          </Text>
          <Text className="text-sm font-montserrat text-text-muted">
            {t('auth.signup.subtitle')}
          </Text>
        </View>

        {/* OAuth Google (MOB-2.3) — Google = sign-in/registration (crée le user). */}
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

          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <View className="gap-1.5">
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
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="go"
                  onSubmitEditing={handleSubmit(onSubmit)}
                />
                <Button
                  variant="link"
                  size="sm"
                  className="self-end px-0"
                  label={
                    showPassword
                      ? t('auth.common.hidePassword')
                      : t('auth.common.showPassword')
                  }
                  textClassName="text-xs"
                  accessibilityLabel={
                    showPassword
                      ? t('auth.common.hidePassword')
                      : t('auth.common.showPassword')
                  }
                  accessibilityState={{ expanded: showPassword }}
                  onPress={() => setShowPassword((v) => !v)}
                />
              </View>
            )}
          />

          {authError ? <ErrorBanner message={authError} /> : null}

          <Button
            size="lg"
            className="w-full"
            loading={isSubmitting}
            label={
              isSubmitting ? t('auth.signup.submitting') : t('auth.signup.submit')
            }
            onPress={handleSubmit(onSubmit)}
          />
        </View>

        <View className="flex-row items-center justify-center gap-1">
          <Text className="text-sm font-montserrat text-text-muted">
            {t('auth.signup.haveAccount')}
          </Text>
          <Button
            variant="link"
            size="sm"
            className="px-0"
            label={t('auth.signup.signinLink')}
            onPress={() => router.replace('/(auth)/login')}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
