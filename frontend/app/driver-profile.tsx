import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function DeprecatedDriverProfileScreen() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/customer' as any);
  }, [router]);
  return null;
}