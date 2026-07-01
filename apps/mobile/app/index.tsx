import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import AppSplash from '../src/components/shared/AppSplash';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    const boot = async () => {
      const [{ data: { session } }] = await Promise.all([
        supabase.auth.getSession(),
        new Promise(r => setTimeout(r, 1500)),
      ]);
      router.replace(session ? ('/(member)/dashboard' as any) : '/(auth)/landing');
    };
    boot();
  }, []);

  return <AppSplash />;
}
