import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Fuel Fleet Auth', headerShown: false }} />
      <Stack.Screen name="driver" options={{ title: 'Driver Dashboard' }} />
      <Stack.Screen name="driver-profile" options={{ title: 'Driver Profile' }} />
      <Stack.Screen name="operator" options={{ title: 'Operator Dashboard' }} />
      <Stack.Screen name="operator-profile" options={{ title: 'Operator Profile' }} />
    </Stack>
  );
}