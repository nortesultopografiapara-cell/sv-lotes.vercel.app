'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { MasterSuperAdminGuard } from '@/components/admin/MasterSuperAdminGuard';

/**
 * Detalhe legado redireciona para o editor completo (Fase 5.1).
 * Mantém a rota /budgets/:id para links antigos.
 */
function DetailRedirect() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id || '');

  useEffect(() => {
    if (!id) return;
    router.replace(`/master/topography/budgets/${id}/edit`);
  }, [id, router]);

  return (
    <div style={{ padding: '1.5rem', color: '#64748b', fontSize: '0.875rem' }}>
      Abrindo editor do orçamento…
    </div>
  );
}

export default function TopographyQuoteDetailPage() {
  return (
    <MasterSuperAdminGuard>
      <DetailRedirect />
    </MasterSuperAdminGuard>
  );
}
