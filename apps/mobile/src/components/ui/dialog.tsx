import { type ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { cn } from '@/lib/cn';
import { useTranslation } from '@/lib/i18n';

// Dialog modal — primitive UI manquante côté mobile (port des `Dialog`/`AlertDialog`
// web). S'appuie sur le `Modal` natif RN (transparent + backdrop). Le contenu est une
// carte centrée. Boutons de pied via `DialogFooter` (cibles ≥ 44 px, parité règle web).

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function Dialog({ open, onClose, children }: DialogProps) {
  const { t } = useTranslation();
  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        onPress={onClose}
        accessibilityLabel={t('common.closeA11y')}
        className="flex-1 items-center justify-center bg-black/40 px-6"
      >
        {/* Stop propagation : un tap dans la carte ne ferme pas. */}
        <Pressable
          onPress={() => {}}
          className="w-full max-w-md rounded-2xl border border-border bg-card p-5"
        >
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function DialogTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Text
      className={cn(
        'mb-3 text-lg font-montserrat-semibold text-text-primary',
        className,
      )}
    >
      {children}
    </Text>
  );
}

export function DialogBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <View className={cn('gap-3', className)}>{children}</View>;
}

export function DialogFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <View className={cn('mt-5 flex-row justify-end gap-2', className)}>
      {children}
    </View>
  );
}
