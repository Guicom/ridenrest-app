import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ErrorBanner } from '@/components/ui/error-banner';
import { TextField } from '@/components/ui/text-field';
import { useAccountActions } from '@/hooks/use-account';
import { cn } from '@/lib/cn';
import { useTranslation } from '@/lib/i18n';

// Sections « Compte » + « Zone de danger » des Paramètres (MOB-2.5 / AC1, AC2).
// Toute la logique (signOut, deleteUser, purge locale) vit dans `useAccountActions`;
// ce composant ne porte que la présentation, la **confirmation forte** (saisie d'un
// mot, jamais un simple tap) et le feedback d'erreur in-page (`<ErrorBanner />`,
// jamais `Alert.alert` — archi §Loading states & errors).
//
// Suppression = action irréversible / outward-facing → garde-fou produit : la
// confirmation par saisie typée (parité web story 2.4) est obligatoire (AC2). Un
// échec ne déconnecte PAS et ne supprime rien : aucun état partiel.

export interface AccountSectionProps {
  className?: string;
}

export function AccountSection({ className }: AccountSectionProps) {
  const { t } = useTranslation();
  const { logout, isLoggingOut, deleteAccount, isDeleting } =
    useAccountActions();

  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [isSheetOpen, setSheetOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Mot de confirmation localisé (« SUPPRIMER » / « DELETE »). Comparaison
  // insensible à la casse + trim pour tolérer la saisie clavier mobile.
  const confirmWord = t('settings.deleteAccount.confirmWord');
  const isConfirmValid =
    confirmText.trim().toUpperCase() === confirmWord.toUpperCase();

  const handleLogout = async () => {
    if (isLoggingOut) return; // anti double-submit (symétrie avec handleConfirmDelete)
    setLogoutError(null);
    try {
      await logout();
    } catch {
      setLogoutError(t('settings.logout.error'));
    }
  };

  const openSheet = () => {
    setConfirmText('');
    setDeleteError(null);
    setSheetOpen(true);
  };

  const closeSheet = () => {
    if (isDeleting) return; // ne pas fermer pendant l'appel (anti-état incohérent)
    setSheetOpen(false);
  };

  const handleConfirmDelete = async () => {
    if (!isConfirmValid || isDeleting) return;
    setDeleteError(null);
    try {
      await deleteAccount();
      // Succès : `useAccountActions` a déjà purgé + redirigé vers login.
    } catch {
      // Échec serveur/réseau : reste connecté, données intactes, modal ouverte.
      setDeleteError(t('settings.deleteAccount.error'));
    }
  };

  return (
    <View className={cn('gap-6', className)}>
      {/* ── Compte : déconnexion ─────────────────────────────────────────── */}
      <View className="gap-3">
        <Text className="px-1 text-xs font-montserrat-semibold uppercase text-text-muted">
          {t('settings.accountSection')}
        </Text>
        <Card className="w-full">
          <CardContent>
            <Button
              variant="outline"
              loading={isLoggingOut}
              onPress={handleLogout}
              label={
                isLoggingOut
                  ? t('settings.logout.loading')
                  : t('settings.logout.button')
              }
              accessibilityLabel={t('settings.logout.button')}
              accessibilityHint={t('settings.logout.hint')}
            />
            {logoutError ? (
              <ErrorBanner message={logoutError} className="mt-3" />
            ) : null}
          </CardContent>
        </Card>
      </View>

      {/* ── Zone de danger : suppression de compte ───────────────────────── */}
      <View className="gap-3">
        <Text className="px-1 text-xs font-montserrat-semibold uppercase text-destructive">
          {t('settings.dangerSection')}
        </Text>
        <Card className="w-full border-destructive">
          <CardContent>
            <Button
              variant="destructive"
              onPress={openSheet}
              label={t('settings.deleteAccount.button')}
              accessibilityLabel={t('settings.deleteAccount.button')}
              accessibilityHint={t('settings.deleteAccount.hint')}
            />
          </CardContent>
        </Card>
      </View>

      {/* ── Confirmation forte (typed-confirmation) ──────────────────────── */}
      <Modal
        visible={isSheetOpen}
        transparent
        animationType="fade"
        onRequestClose={closeSheet}
      >
        {/* Backdrop : dismiss tactile uniquement. `accessible={false}` pour que le
            lecteur d'écran ne focalise PAS l'overlay plein écran comme un bouton
            géant (le tap reste actif ; les SR passent par le bouton « Annuler »
            explicite de la modal). `accessible={false}` n'affecte pas les
            descendants (≠ accessibilityElementsHidden) → le contenu reste lu. */}
        <Pressable
          className="flex-1 items-center justify-center bg-black/50 p-6"
          onPress={closeSheet}
          accessible={false}
        >
          {/* `onPress` vide : stoppe la propagation du tap fond → ne ferme pas. */}
          <Pressable
            className="w-full gap-4 rounded-xl border border-border bg-card p-5"
            onPress={() => {}}
            testID="delete-account-sheet"
          >
            <Text className="text-lg font-montserrat-bold text-card-foreground">
              {t('settings.deleteAccount.warningTitle')}
            </Text>
            <Text className="text-sm font-montserrat text-text-muted">
              {t('settings.deleteAccount.warning')}
            </Text>

            <TextField
              label={t('settings.deleteAccount.confirmLabel', {
                word: confirmWord,
              })}
              value={confirmText}
              onChangeText={setConfirmText}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder={confirmWord}
              editable={!isDeleting}
            />

            {deleteError ? <ErrorBanner message={deleteError} /> : null}

            <View className="gap-2">
              <Button
                variant="destructive"
                disabled={!isConfirmValid}
                loading={isDeleting}
                onPress={handleConfirmDelete}
                label={
                  isDeleting
                    ? t('settings.deleteAccount.deleting')
                    : t('settings.deleteAccount.confirm')
                }
                accessibilityLabel={t('settings.deleteAccount.confirm')}
              />
              <Button
                variant="ghost"
                disabled={isDeleting}
                onPress={closeSheet}
                label={t('settings.deleteAccount.cancel')}
                accessibilityLabel={t('settings.deleteAccount.cancel')}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
