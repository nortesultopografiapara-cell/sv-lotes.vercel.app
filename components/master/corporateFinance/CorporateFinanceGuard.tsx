'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { readImpersonationState } from '@/lib/impersonationStorage';

/**
 * Guarda exclusiva do Financeiro Corporativo Master:
 * - somente SUPER_ADMIN
 * - bloqueia ADMIN / OWNER / BROKER / CUSTOMER (e demais)
 * - bloqueia durante impersonation de tenant
 */
export function CorporateFinanceGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [impersonating] = useState(() =>
    typeof window !== 'undefined' ? Boolean(readImpersonationState()?.tenantId) : false,
  );

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'SUPER_ADMIN') {
      router.replace('/dashboard');
      return;
    }
    if (impersonating) {
      router.replace('/dashboard');
    }
  }, [loading, user, router, impersonating]);

  if (loading || !user) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-blue-700" />
      </div>
    );
  }

  if (user.role !== 'SUPER_ADMIN') {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md text-center rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <ShieldAlert className="w-8 h-8 text-amber-600 mx-auto mb-3" />
          <p className="text-sm text-slate-700">Acesso restrito a SUPER_ADMIN.</p>
        </div>
      </div>
    );
  }

  if (impersonating) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md text-center rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <ShieldAlert className="w-8 h-8 text-amber-600 mx-auto mb-3" />
          <p className="text-sm text-slate-700">
            Financeiro Corporativo Master indisponível durante impersonation. Encerre a sessão da
            empresa e tente novamente.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export function useCorporateFinanceAuthParams() {
  const { user } = useAuth();
  const userId = user?.id || '';
  const impersonatingTenantId =
    typeof window !== 'undefined' ? readImpersonationState()?.tenantId ?? null : null;

  const qs = useCallback(() => {
    const p = new URLSearchParams();
    if (userId) p.set('userId', userId);
    if (impersonatingTenantId) p.set('impersonatingTenantId', impersonatingTenantId);
    return p.toString();
  }, [userId, impersonatingTenantId]);

  const bodyAuth = useCallback(
    () => ({
      userId: userId || undefined,
      impersonatingTenantId: impersonatingTenantId || undefined,
    }),
    [userId, impersonatingTenantId],
  );

  return { userId, impersonatingTenantId, qs, bodyAuth };
}
