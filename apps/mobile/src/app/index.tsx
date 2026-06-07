import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { haversine } from '@ridenrest/gpx';
import { LAYER_CATEGORIES } from '@ridenrest/shared';

// Vérification résolution monorepo (MOB-1.1 / AC3) : Metro doit résoudre
// @ridenrest/shared et @ridenrest/gpx depuis packages/* sans duplication.
const LAYER_COUNT = Object.keys(LAYER_CATEGORIES).length;
const PARIS_LYON_KM = Math.round(
  haversine({ lat: 48.8566, lng: 2.3522 }, { lat: 45.764, lng: 4.8357 }),
);

export default function HomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ride&apos;n&apos;Rest</Text>
      <Text style={styles.subtitle}>apps/mobile — coquille MOB-1.1</Text>

      <View style={styles.card}>
        <Text style={styles.cardText}>
          @ridenrest/shared → {LAYER_COUNT} layers POI
        </Text>
        <Text style={styles.cardText}>
          @ridenrest/gpx → Paris–Lyon ≈ {PARIS_LYON_KM} km (haversine)
        </Text>
      </View>

      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={() => router.push('/explore')}
      >
        <Text style={styles.buttonText}>Naviguer vers /explore</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.6,
  },
  card: {
    alignSelf: 'stretch',
    borderRadius: 12,
    backgroundColor: 'rgba(45, 106, 74, 0.08)',
    padding: 16,
    gap: 8,
  },
  cardText: {
    fontSize: 14,
  },
  button: {
    borderRadius: 8,
    backgroundColor: '#2D6A4A',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
});
