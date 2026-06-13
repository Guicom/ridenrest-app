import { cssInterop } from 'nativewind';
import {
  Bike,
  ChevronDown,
  GripVertical,
  Pencil,
  Plus,
  RefreshCw,
  Route,
  Settings,
  Trash2,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react-native';

// Icônes lucide (MOB-3.1) — MÊME jeu d'icônes que le web (`lucide-react`), ici la
// variante React Native (`lucide-react-native`, rendue via `react-native-svg`).
//
// NativeWind ne connaît pas nativement les composants lucide : on enregistre un
// `cssInterop` par icône pour que `className="text-text-muted"` mappe la couleur
// du token vers la prop `color` du SVG (`stroke`). On garde ainsi le styling par
// `className` (parité web, tokens partagés) — zéro hex runtime dans les écrans.
//
// La `size` reste pilotée par la prop `size` de lucide (numérique), pas par
// className (les dimensions d'un SVG ne suivent pas le flux NativeWind w-/h-).
function enableClassName(icon: LucideIcon): LucideIcon {
  cssInterop(icon, {
    className: {
      target: 'style',
      nativeStyleToProp: { color: true },
    },
  });
  return icon;
}

export const BikeIcon = enableClassName(Bike);
export const ChevronDownIcon = enableClassName(ChevronDown);
export const GripVerticalIcon = enableClassName(GripVertical);
export const PencilIcon = enableClassName(Pencil);
export const PlusIcon = enableClassName(Plus);
export const RefreshCwIcon = enableClassName(RefreshCw);
export const RouteIcon = enableClassName(Route);
export const SettingsIcon = enableClassName(Settings);
export const Trash2Icon = enableClassName(Trash2);
export const TrendingDownIcon = enableClassName(TrendingDown);
export const TrendingUpIcon = enableClassName(TrendingUp);

export type { LucideIcon };
