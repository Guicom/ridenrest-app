import { cssInterop } from 'nativewind';
import {
  BedDouble,
  Bike,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CloudRain,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  GripVertical,
  Map as LucideMap,
  Minus,
  Navigation,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Route,
  Search,
  Settings,
  Shield,
  ShoppingBasket,
  SlidersHorizontal,
  Thermometer,
  Trash2,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Umbrella,
  Upload,
  Utensils,
  Wind,
  X,
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

export const BedDoubleIcon = enableClassName(BedDouble);
export const BikeIcon = enableClassName(Bike);
export const CheckIcon = enableClassName(Check);
export const ChevronDownIcon = enableClassName(ChevronDown);
export const ChevronLeftIcon = enableClassName(ChevronLeft);
export const ChevronRightIcon = enableClassName(ChevronRight);
export const ChevronUpIcon = enableClassName(ChevronUp);
export const CloudRainIcon = enableClassName(CloudRain);
export const CopyIcon = enableClassName(Copy);
export const ExternalLinkIcon = enableClassName(ExternalLink);
export const FileTextIcon = enableClassName(FileText);
export const GlobeIcon = enableClassName(Globe);
export const GripVerticalIcon = enableClassName(GripVertical);
export const MapIcon = enableClassName(LucideMap);
export const MinusIcon = enableClassName(Minus);
export const NavigationIcon = enableClassName(Navigation);
export const PencilIcon = enableClassName(Pencil);
export const PhoneIcon = enableClassName(Phone);
export const PlusIcon = enableClassName(Plus);
export const RefreshCwIcon = enableClassName(RefreshCw);
export const RouteIcon = enableClassName(Route);
export const SearchIcon = enableClassName(Search);
export const SettingsIcon = enableClassName(Settings);
export const ShieldIcon = enableClassName(Shield);
export const ShoppingBasketIcon = enableClassName(ShoppingBasket);
export const SlidersHorizontalIcon = enableClassName(SlidersHorizontal);
export const ThermometerIcon = enableClassName(Thermometer);
export const Trash2Icon = enableClassName(Trash2);
export const TrendingDownIcon = enableClassName(TrendingDown);
export const TrendingUpIcon = enableClassName(TrendingUp);
export const TriangleAlertIcon = enableClassName(TriangleAlert);
export const UmbrellaIcon = enableClassName(Umbrella);
export const UploadIcon = enableClassName(Upload);
export const UtensilsIcon = enableClassName(Utensils);
export const WindIcon = enableClassName(Wind);
export const XIcon = enableClassName(X);

export type { LucideIcon };
