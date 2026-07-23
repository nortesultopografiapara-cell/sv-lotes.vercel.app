'use client';

import { useAuth } from '@/hooks/useAuth';
import MasterExecutiveDashboard from '@/components/master/dashboard/MasterExecutiveDashboard';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { isMasterConsoleRole } from '@/lib/rolePermissions';

/**
 * Hub do Painel Executivo SV Topografia — destino pós-login do SUPER_ADMIN.
 * O Painel SaaS legado permanece em /dashboard.
 */
export default function MasterHomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!isMasterConsoleRole(user.role)) {
      router.replace('/dashboard');
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-blue-700" />
      </div>
    );
  }

  if (!isMasterConsoleRole(user.role)) {
    return null;
  }

  return <MasterExecutiveDashboard user={user} />;
}
