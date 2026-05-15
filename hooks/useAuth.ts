import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export interface UserProfile {
  id: string;
  tenant_id: string | null;
  role: string;
  email: string;
  name: string;
  force_password_change: boolean;
  onboarding_completed: boolean;
}

export function useAuth() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    
    async function getUser() {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
          if (mounted) {
            setUser(null);
            setLoading(false);
          }
          return;
        }

        const { data: userData, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (error || !userData) {
          if (mounted) {
            setUser(null);
            setLoading(false);
          }
        } else {
          if (mounted) {
            setUser({
              id: session.user.id,
              tenant_id: userData.tenant_id,
              role: userData.role,
              email: session.user.email || '',
              name: userData.full_name || session.user.email?.split('@')[0] || 'Usuário',
              force_password_change: userData.force_password_change || false,
              onboarding_completed: userData.onboarding_completed || false,
            });
            setLoading(false);
          }
        }
      } catch (e) {
        if (mounted) {
           setUser(null);
           setLoading(false);
        }
      }
    }

    getUser();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
       if (event === 'SIGNED_OUT') {
         if (mounted) {
           setUser(null);
           // Clear sensitive tenant cache on logout
           localStorage.removeItem('active_tenant');
           sessionStorage.clear();
           router.replace('/login');
         }
       } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
         getUser();
       } else if (event === 'PASSWORD_RECOVERY') {
         // Redirect the invited user to set a new password
         router.push('/onboarding');
       }
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  return { user, loading };
}
