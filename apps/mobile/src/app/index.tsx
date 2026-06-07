import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { haversine } from '@ridenrest/gpx';
import { LAYER_CATEGORIES } from '@ridenrest/shared';

import { Button } from '@/components/ui/button';

// Vérification résolution monorepo (MOB-1.1 / AC3) : Metro doit résoudre
// @ridenrest/shared et @ridenrest/gpx depuis packages/* sans duplication.
const LAYER_COUNT = Object.keys(LAYER_CATEGORIES).length;
const PARIS_LYON_KM = Math.round(
  haversine({ lat: 48.8566, lng: 2.3522 }, { lat: 45.764, lng: 4.8357 }),
);

// MOB-1.3 : écran stylé via NativeWind + design-tokens (dogfooding du DS) — et
// bouton issu du primitif partagé `<Button>` (className, plus de `Pressable` à
// `style`-fonction, que le wrapping NativeWind n'appliquait pas).
export default function HomeScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background-page p-6">
      <Text className="text-3xl font-montserrat-bold text-text-primary">
        Ride&apos;n&apos;Rest
      </Text>
      <Text className="text-sm font-montserrat text-text-muted">
        apps/mobile — coquille MOB-1.1 · design system MOB-1.3
      </Text>

      <View className="w-full gap-2 rounded-xl border border-border bg-primary-light p-4">
        <Text className="text-sm font-montserrat text-text-secondary">
          @ridenrest/shared → {LAYER_COUNT} layers POI
        </Text>
        <Text className="text-sm font-montserrat text-text-secondary">
          @ridenrest/gpx → Paris–Lyon ≈ {PARIS_LYON_KM} km (haversine)
        </Text>
      </View>

      <Button
        size="lg"
        label="Naviguer vers /explore"
        onPress={() => router.push('/explore')}
      />
    </View>
  );
}
