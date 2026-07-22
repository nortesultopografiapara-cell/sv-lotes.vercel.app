'use client';

import { Suspense } from 'react';
import CorporateReceivablesPage from '@/components/master/corporateFinance/CorporateReceivablesPage';

export default function MasterCorporateReceivablesRoute() {
  return (
    <Suspense fallback={<div style={{ padding: '1.5rem', color: '#64748b' }}>Carregando…</div>}>
      <CorporateReceivablesPage />
    </Suspense>
  );
}
