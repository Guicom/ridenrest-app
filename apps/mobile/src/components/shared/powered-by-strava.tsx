import { SvgXml } from 'react-native-svg';

import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  POWERED_BY_STRAVA_BLACK,
  POWERED_BY_STRAVA_WHITE,
} from './powered-by-strava-assets';

// Wordmark « Powered by Strava » (MOB-3.1, parité web `components/shared/powered-by-strava`).
// Attribution obligatoire (FR-063) affichée sur les cartes/segments issus de Strava.
// Variante noire en light, blanche en dark (asset officiel tiers, jamais modifié).
// Ratio natif 176×60 ; on contrôle la hauteur et déduit la largeur (× 176/60).

const ASPECT = 176 / 60;

export interface PoweredByStravaProps {
  /** Hauteur du wordmark en px (défaut 16, ≈ `h-4` web). */
  height?: number;
}

export function PoweredByStrava({ height = 16 }: PoweredByStravaProps) {
  const { colorScheme } = useColorScheme();
  const xml =
    colorScheme === 'dark' ? POWERED_BY_STRAVA_WHITE : POWERED_BY_STRAVA_BLACK;
  return (
    <SvgXml
      xml={xml}
      width={height * ASPECT}
      height={height}
      accessibilityRole="image"
      accessibilityLabel="Powered by Strava"
    />
  );
}
