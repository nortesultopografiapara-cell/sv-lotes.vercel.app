'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { isPlatformAdmin } from '@/lib/rls';

export function MasterSuperAdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (!isPlatformAdmin(user.role)) router.replace('/dashboard');
  }, [loading, user, router]);

  if (loading || !user || !isPlatformAdmin(user.role)) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  return <>{children}</>;
}
