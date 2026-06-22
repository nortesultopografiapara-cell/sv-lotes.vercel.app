'use client';

import { FlaskConical } from 'lucide-react';
import { DEMO_ENVIRONMENT_BANNER } from '@/lib/demoRestrictions';

export function DemoEnvironmentBanner() {
  return (
    <div className="bg-amber-500/15 border-b border-amber-500/35 px-4 py-2.5 flex items-center justify-center gap-2 text-sm text-amber-200 z-50">
      <FlaskConical className="w-4 h-4 shrink-0 text-amber-400" />
      <span>{DEMO_ENVIRONMENT_BANNER}</span>
    </div>
  );
}
