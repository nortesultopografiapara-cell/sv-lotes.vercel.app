'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { SuperAdminOnlyGuard } from '@/components/admin/SuperAdminOnlyGuard';
import { SaasCashPanel } from '@/components/master/saas/SaasCashPanel';

export default function SaasCashPage() {
  return (
    <SuperAdminOnlyGuard>
      <Suspense fallback={null}>
        <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
          <div className="mb-6">
            <Link
              href="/saas-finance"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Financeiro SaaS
            </Link>
          </div>
          <SaasCashPanel showBackLink />
        </div>
      </Suspense>
    </SuperAdminOnlyGuard>
  );
}
