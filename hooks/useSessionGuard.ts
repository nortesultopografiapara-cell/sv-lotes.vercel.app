import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from './useAuth';

const PUBLIC_ROUTES = ['/login', '/verify-email', '/auth/callback'];
const ONBOARDING_ROUTES = ['/onboarding'];

export function useSessionGuard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;

    // Disable conflicted redirects temporarily for debugging purposes
    /*
    if (!user) {
      if (!PUBLIC_ROUTES.includes(pathname)) {
        router.replace('/login');
      }
      return;
    }

    // Email is guaranteed by Middleware mostly, but we can also react to user changes
    
    // Soft guard on client for onboarding
    const needsOnboarding = !user.onboarding_completed || user.force_password_change;

    if (needsOnboarding && !ONBOARDING_ROUTES.includes(pathname)) {
      router.replace('/onboarding');
      return;
    }

    if (!needsOnboarding && ONBOARDING_ROUTES.includes(pathname)) {
      router.replace('/');
      return;
    }

    if (pathname.startsWith('/empresas') && user.role !== 'SUPER_ADMIN') {
      router.replace('/');
      return;
    }
    */
  }, [user, loading, pathname, router]);

  return { user, loading };
}
