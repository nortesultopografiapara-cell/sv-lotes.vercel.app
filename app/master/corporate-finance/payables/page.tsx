'use client';

import { Suspense } from 'react';
import CorporatePayablesPage from '@/components/master/corporateFinance/CorporatePayablesPage';

export default function MasterCorporatePayablesRoute() {
  return (
    <Suspense fallback={<div style={{ padding: '1.5rem', color: '#64748b' }}>Carregando…</div>}>
      <CorporatePayablesPage />
    </Suspense>
  );
}
