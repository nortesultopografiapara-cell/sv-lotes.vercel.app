'use client';

import { Suspense } from 'react';
import TopographyProjectsPage from '@/components/master/topography/projects/TopographyProjectsPage';

export default function MasterTopographyProjectsRoute() {
  return (
    <Suspense fallback={<div style={{ padding: '1.5rem', color: '#64748b' }}>Carregando…</div>}>
      <TopographyProjectsPage />
    </Suspense>
  );
}
