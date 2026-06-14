import {
  DENSITY_ACCOMMODATION_CATEGORIES,
  POI_CATEGORY_COLORS,
} from '@ridenrest/shared';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTranslation } from '@/lib/i18n';

// Dialog de sélection des catégories à analyser (densité) — port iso du web. Tous les
// types sélectionnés par défaut ; ≥ 1 requis. `onConfirm` reçoit le tableau de catégories.

export interface DensityCategoryDialogProps {
  open: boolean;
  isLoading?: boolean;
  onConfirm: (categories: string[]) => void;
  onClose: () => void;
}

export function DensityCategoryDialog({
  open,
  isLoading = false,
  onConfirm,
  onClose,
}: DensityCategoryDialogProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(DENSITY_ACCOMMODATION_CATEGORIES),
  );

  const toggle = (type: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{t('map.density.categoriesTitle')}</DialogTitle>
      <DialogBody>
        <View className="flex-row flex-wrap gap-2">
          {DENSITY_ACCOMMODATION_CATEGORIES.map((type) => {
            const isActive = selected.has(type);
            const color = POI_CATEGORY_COLORS[type];
            return (
              <Pressable
                key={type}
                accessibilityRole="switch"
                accessibilityState={{ checked: isActive }}
                accessibilityLabel={t(`pois.category.${type}`)}
                onPress={() => toggle(type)}
                style={
                  isActive
                    ? { backgroundColor: color, borderColor: 'transparent' }
                    : undefined
                }
                className={
                  isActive
                    ? 'rounded-full px-3 py-1.5'
                    : 'rounded-full border border-border bg-card px-3 py-1.5 opacity-60'
                }
              >
                <Text
                  className={
                    isActive
                      ? 'text-sm font-montserrat-medium text-white'
                      : 'text-sm font-montserrat-medium text-text-primary'
                  }
                >
                  {t(`pois.category.${type}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </DialogBody>
      <DialogFooter>
        <Button
          variant="outline"
          size="lg"
          label={t('common.cancel')}
          onPress={onClose}
        />
        <Button
          size="lg"
          label={t('map.density.launch')}
          disabled={selected.size === 0 || isLoading}
          onPress={() => onConfirm([...selected])}
          testID="density-launch-btn"
        />
      </DialogFooter>
    </Dialog>
  );
}
