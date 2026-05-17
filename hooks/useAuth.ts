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
        // First check for contingency bypass (user requested emergency access)
        const contingencyAuth = localStorage.getItem('contingency_auth');
        if (contingencyAuth) {
          try {
            const parsed = JSON.parse(contingencyAuth);
            if (mounted) {
              setUser({
                id: parsed.id,
                tenant_id: parsed.tenant_id,
                role: parsed.role,
                email: parsed.email,
                name: parsed.name,
                force_password_change: false,
                onboarding_completed: true,
              });
              setLoading(false);
            }
            return;
          } catch (e) {
            localStorage.removeItem('contingency_auth');
          }
        }

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

        let tenant_id = userData?.tenant_id || session.user.user_metadata?.tenant_id || null;
        let role = (userData?.role || session.user.user_metadata?.role || '').toUpperCase();

        if (session.user.email) {
            // Buscando o ID da empresa associada ao e-mail
            const { data: comp } = await supabase.from('companies').select('id, admin_email, email').or(`email.eq.${session.user.email},admin_email.eq.${session.user.email}`).maybeSingle();
            
            if (comp && comp.id) {
                tenant_id = comp.id;
                // Gestor
                if (!role || role === 'USER') {
                    role = 'ADMIN_TENANT';
                }
            } else if (!tenant_id) {
               // Fallback: Check Se existe só uma empresa
               const { data: allComps } = await supabase.from('companies').select('id').limit(1);
               if (allComps && allComps.length > 0) {
                  tenant_id = allComps[0].id;
               }
            }
        }

        if (error || !userData) {
          // If the user doesn't exist in public.users yet, we can still auth them based on session + companies record
          if (mounted) {
            setUser({
              id: session.user.id,
              tenant_id: tenant_id,
              role: role || 'USER',
              email: session.user.email || '',
              name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Usuário',
              force_password_change: false,
              onboarding_completed: true,
            });
            setLoading(false);
          }
        } else {
          if (mounted) {
            setUser({
              id: session.user.id,
              tenant_id: tenant_id,
              role: role,
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
           localStorage.clear();
           sessionStorage.clear();
           if (window.location.pathname !== '/login') {
             window.location.href = '/login';
           }
         }
       } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
         getUser();
       } else if (event === 'PASSWORD_RECOVERY') {
         // Let middleware handle any further redirect if necessary
       }
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  return { user, loading };
}
