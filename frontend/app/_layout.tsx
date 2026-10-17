import { Stack } from 'expo-router';
import { LanguageProvider } from '../src/i18n/LanguageContext';

export default function RootLayout() {
  return (
    <LanguageProvider>
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: '#F8FAFC' },
          headerStyle: { backgroundColor: '#FFFFFF' },
          headerTintColor: '#0F172A',
          headerTitleStyle: { fontWeight: '700' },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Fuel Fleet Auth', headerShown: false }} />
        <Stack.Screen name="customer" options={{ title: 'Fleet Customer Dashboard', headerShown: false }} />
        <Stack.Screen name="customer-profile" options={{ title: 'Customer Profile' }} />
        <Stack.Screen name="pump-admin" options={{ title: 'Pump Admin Dashboard', headerShown: false }} />
        <Stack.Screen name="pump-admin-profile" options={{ title: 'Pump Admin Profile', headerShown: false }} />
        <Stack.Screen name="driver" options={{ title: 'Driver Dashboard' }} />
        <Stack.Screen name="driver-profile" options={{ title: 'Driver Profile' }} />
        <Stack.Screen name="operator" options={{ title: 'Operator Dashboard' }} />
        <Stack.Screen name="operator-profile" options={{ title: 'Operator Profile' }} />
        <Stack.Screen name="operator-completed" options={{ title: 'Completed Requests' }} />
      </Stack>
    </LanguageProvider>
  );
}