import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { logRlsCompany, logRlsTenant } from '@/lib/rls';
import { useRouter } from 'next/navigation';
import {
  PASSWORD_RECOVERY_RESET_PATH,
  clearPasswordRecoveryLock,
  hasPasswordRecoveryLock,
  isPasswordRecoveryPublicPath,
  looksLikeRecoveryCallback,
  markPasswordRecoveryLock,
} from '@/lib/auth/passwordRecovery';

export interface UserProfile {
  id: string;
  tenant_id: string | null;
  company_id: string | null;
  role: string;
  email: string;
  name: string;
  force_password_change: boolean;
  onboarding_completed: boolean;
  is_demo: boolean;
}

export function useAuth() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    // Check demo/dev mode first
    const isDevPreview = typeof window !== 'undefined' && 
                         (window.location.hostname.includes("aistudio") || 
                          window.location.hostname.includes("run.app") ||
                          process.env.NODE_ENV === "development");

    const isDemo = typeof window !== 'undefined' && 
                   document.cookie.includes('demo_mode=true') && 
                   !isSupabaseConfigured;

    const onRecoveryPath =
      typeof window !== 'undefined' &&
      isPasswordRecoveryPublicPath(window.location.pathname);

    if (!onRecoveryPath && isDevPreview && process.env.NODE_ENV !== 'production') {
      if (mounted) {
        Promise.resolve().then(() => {
          setUser({
            id: 'dev-preview-user',
            tenant_id: '75fcaae6-8975-4e06-9100-8c8aa1537854',
            company_id: '75fcaae6-8975-4e06-9100-8c8aa1537854',
            role: 'MASTER-ADMIN',
            email: 'sv@svtopografiaeprojetos.com.br',
            name: 'Desenvolvedor (Preview)',
            force_password_change: false,
            onboarding_completed: true,
            is_demo: false,
          });
          setLoading(false);
          
          if (window.location.pathname === '/login') {
            router.push('/map');
          }
        });
      }
      return;
    }

    if (isDemo && process.env.NODE_ENV !== 'production') {
      if (mounted) {
        Promise.resolve().then(() => {
          setUser({
            id: 'demo-user-id',
            tenant_id: 'demo-tenant-id',
            company_id: 'demo-tenant-id',
            role: 'ADMIN',
            email: 'demo@preview.local',
            name: 'Visitante (Demo)',
            force_password_change: false,
            onboarding_completed: true,
            is_demo: false,
          });
          setLoading(false);
        });
      }
      return;
    }
    
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
            const companyId = userData.company_id ?? userData.tenant_id ?? null;
            logRlsCompany(companyId);
            logRlsTenant(userData.tenant_id ?? companyId);
            setUser({
              id: session.user.id,
              tenant_id: userData.tenant_id,
              company_id: companyId,
              role: (userData.role || '').toUpperCase(),
              email: session.user.email || '',
              name: userData.full_name || session.user.email?.split('@')[0] || 'Usuário',
              force_password_change: userData.force_password_change || false,
              onboarding_completed: userData.onboarding_completed || false,
              is_demo: userData.is_demo === true,
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
           try {
             localStorage.removeItem('active_tenant');
             localStorage.removeItem('contingency_auth');
             sessionStorage.clear();
           } catch(e) {}
           clearPasswordRecoveryLock();
           if (
             window.location.pathname !== '/login' &&
             !isPasswordRecoveryPublicPath(window.location.pathname)
           ) {
             window.location.assign('/login');
           }
         }
       } else if (event === 'PASSWORD_RECOVERY') {
         markPasswordRecoveryLock();
         if (window.location.pathname !== PASSWORD_RECOVERY_RESET_PATH) {
           window.location.assign(PASSWORD_RECOVERY_RESET_PATH);
         }
       } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
         const search = new URLSearchParams(window.location.search);
         const hash = window.location.hash || '';
         if (looksLikeRecoveryCallback(search, hash)) {
           markPasswordRecoveryLock();
         }
         if (
           hasPasswordRecoveryLock() &&
           !isPasswordRecoveryPublicPath(window.location.pathname)
         ) {
           window.location.assign(PASSWORD_RECOVERY_RESET_PATH);
           return;
         }
         getUser();
       }
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  return { user, loading };
}
