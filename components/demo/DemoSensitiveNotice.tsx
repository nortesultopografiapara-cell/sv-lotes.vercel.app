'use client';

import { AlertTriangle } from 'lucide-react';

export function DemoSensitiveNotice({ message }: { message: string }) {
  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      <p>{message}</p>
    </div>
  );
}
