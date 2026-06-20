'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

function isSuperAdminRole(role?: string | null): boolean {
  return String(role || '').toUpperCase() === 'SUPER_ADMIN';
}

export function SuperAdminOnlyGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  if (!isSuperAdminRole(user.role)) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-3">
          <ShieldAlert className="w-10 h-10 mx-auto text-amber-400" />
          <h2 className="text-lg font-semibold text-white">Acesso restrito</h2>
          <p className="text-sm text-gray-400">
            O Caixa SaaS está disponível somente para Super Admin.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
