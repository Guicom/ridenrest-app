import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/button';

// 2ᵉ route placeholder (MOB-1.1 / AC5) : cible de la navigation programmatique
// depuis index.tsx — sera remplacée par les écrans réels aux epics MOB-2+.
// MOB-1.3 : stylé via NativeWind + design-tokens, bouton = primitif `<Button>`.
export default function ExploreScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background-page p-6">
      <Text className="text-2xl font-montserrat-bold text-text-primary">
        Explore
      </Text>
      <Text className="text-sm font-montserrat text-text-muted">
        Navigation Expo Router opérationnelle ✓
      </Text>

      <Button
        variant="outline"
        size="lg"
        label="Retour"
        onPress={() => router.back()}
      />
    </View>
  );
}
