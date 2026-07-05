import { Text, View } from 'react-native';
import type { ParseStatus } from '@ridenrest/shared';

import { cn } from '@/lib/cn';
import { useTranslation } from '@/lib/i18n';

// Badge d'état de parsing d'un segment (MOB-3.2 / AC2-3). Mappe `parseStatus` vers
// un libellé i18n + une couleur de token. A11y : l'information passe par le TEXTE
// (jamais la couleur seule) ; `accessibilityRole` neutre.
//
// Pas de token `success` dans le design system → `primary` (vert de marque) sert
// d'état « Analysé ». Parité visuelle web 3.2 (mêmes 4 états).

const STATUS_STYLES: Record<
  ParseStatus,
  { container: string; text: string; labelKey: string }
> = {
  pending: {
    container: 'bg-muted',
    text: 'text-muted-foreground',
    labelKey: 'adventures.segments.status.pending',
  },
  processing: {
    container: 'bg-accent',
    text: 'text-accent-foreground',
    labelKey: 'adventures.segments.status.processing',
  },
  done: {
    container: 'bg-primary',
    text: 'text-primary-foreground',
    labelKey: 'adventures.segments.status.done',
  },
  error: {
    container: 'bg-destructive',
    text: 'text-white',
    labelKey: 'adventures.segments.status.error',
  },
};

export interface SegmentStatusBadgeProps {
  status: ParseStatus;
  className?: string;
}

export function SegmentStatusBadge({
  status,
  className,
}: SegmentStatusBadgeProps) {
  const { t } = useTranslation();
  const style = STATUS_STYLES[status];
  const label = t(style.labelKey);

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={label}
      className={cn(
        'self-start rounded-full px-2.5 py-0.5',
        style.container,
        className,
      )}
    >
      <Text className={cn('text-xs font-montserrat-semibold', style.text)}>
        {label}
      </Text>
    </View>
  );
}
