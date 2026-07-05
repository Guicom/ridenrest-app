import { POI_CLUSTER_COLOR } from '@ridenrest/shared';
import { Pressable, View } from 'react-native';

import { cn } from '@/lib/cn';

// Interrupteur (toggle) — primitive UI manquante côté mobile. Utilisé par les toggles
// « Afficher sur la carte » (Étapes/Météo/Densité). A11y `switch` + `checked`.
// Cible tactile ≥ 44 px de large.
//
// ⚠️ Couleurs en **style inline** (pas de classes) : l'opacité Tailwind sur un token
// (`bg-primary/20`) ne rend PAS dans ce setup NativeWind (piste blanche → invisible).
// OFF = vert de marque translucide (`POI_CLUSTER_COLOR` + alpha) ; pouce blanc à
// **contour gris visible** dans les deux états (contraste sur n'importe quelle piste).

const TRACK_ON = POI_CLUSTER_COLOR; // vert de marque plein
const TRACK_OFF = `${POI_CLUSTER_COLOR}33`; // ~20% alpha (vert clair, parité web)
const THUMB_BG = '#ffffff';
const THUMB_BORDER = '#9CA3AF'; // gris 400 — contour net du pouce

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  className?: string;
}

export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  accessibilityLabel,
  testID,
  className,
}: SwitchProps) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      disabled={disabled}
      onPress={() => onCheckedChange(!checked)}
      style={{ backgroundColor: checked ? TRACK_ON : TRACK_OFF }}
      className={cn(
        'h-7 w-12 justify-center rounded-full px-0.5',
        disabled ? 'opacity-50' : undefined,
        className,
      )}
    >
      <View
        style={{
          backgroundColor: THUMB_BG,
          borderColor: THUMB_BORDER,
          borderWidth: 1.5,
        }}
        className={cn('h-6 w-6 rounded-full', checked ? 'self-end' : 'self-start')}
      />
    </Pressable>
  );
}
