import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

// 2ᵉ route placeholder (MOB-1.1 / AC5) : cible de la navigation programmatique
// depuis index.tsx — sera remplacée par les écrans réels aux epics MOB-2+.
export default function ExploreScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Explore</Text>
      <Text style={styles.subtitle}>
        Navigation Expo Router opérationnelle ✓
      </Text>

      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={() => router.back()}
      >
        <Text style={styles.buttonText}>Retour</Text>
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
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.6,
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
