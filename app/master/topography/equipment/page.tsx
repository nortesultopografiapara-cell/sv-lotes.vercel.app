'use client';

import { Suspense } from 'react';
import EquipmentPage from '@/components/master/topography/equipment/EquipmentPage';

export default function MasterTopographyEquipmentRoute() {
  return (
    <Suspense fallback={<div style={{ padding: '1.5rem', color: '#64748b' }}>Carregando…</div>}>
      <EquipmentPage />
    </Suspense>
  );
}
