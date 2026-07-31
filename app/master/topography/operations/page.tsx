'use client';

import { Suspense } from 'react';
import OperationsPage from '@/components/master/topography/operations/OperationsPage';

export default function MasterTopographyOperationsPage() {
  return (
    <Suspense fallback={<div style={{ padding: '1.5rem', color: '#64748b' }}>Carregando…</div>}>
      <OperationsPage />
    </Suspense>
  );
}
