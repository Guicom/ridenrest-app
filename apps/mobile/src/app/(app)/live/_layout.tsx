import { useKeepAwake } from 'expo-keep-awake';
import { Slot } from 'expo-router';

// Layout du groupe Live (MOB-5.1 / T5). `useKeepAwake()` empêche l'écran de s'éteindre
// tant que le layout Live est monté (FR-044 support) et le **relâche automatiquement**
// au démontage (navigation retour). Décision archi : keep-awake **uniquement** ici, pas
// ailleurs dans l'app. Le guard d'auth est centralisé dans `(app)/_layout.tsx` — pas de
// re-implémentation ici. `<Slot />` rend l'écran enfant (`live/[id].tsx`).
export default function LiveLayout() {
  useKeepAwake();
  return <Slot />;
}
