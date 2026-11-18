'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { isTenantEnterpriseAdminRole } from '@/lib/rolePermissions';
import { LegacySignalRegularizationPanel } from '@/components/finance/LegacySignalRegularizationPanel';

export default function LegacySignalRegularizationPage() {
  const { user, loading } = useAuth();
  const [saleId, setSaleId] = useState('');
  if (loading) return <main className="p-6 text-sm">Carregando…</main>;
  if (!isTenantEnterpriseAdminRole(user?.role)) {
    return <main className="mx-auto max-w-3xl p-6">Esta rotina é restrita ao administrador da empresa.</main>;
  }
  return (
    <main className="mx-auto max-w-5xl p-6">
      <LegacySignalRegularizationPanel saleId={saleId} onSaleIdChange={setSaleId} />
    </main>
  );
}
