import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Ride'n'Rest" }} />
      <Stack.Screen name="explore" options={{ title: 'Explore' }} />
    </Stack>
  );
}
