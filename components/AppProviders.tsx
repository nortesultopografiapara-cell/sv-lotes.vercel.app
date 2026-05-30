'use client';

import { useEffect } from 'react';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { registerGlobalErrorHandlers } from '@/lib/appErrorReporting';
import { ServiceWorkerRegister } from '@/components/offline/ServiceWorkerRegister';
import { registerOfflineCacheDebug } from '@/lib/offline/offlineCacheDebug';

export function AppProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    registerGlobalErrorHandlers();
    registerOfflineCacheDebug();
  }, []);

  return (
    <AppErrorBoundary>
      <ServiceWorkerRegister />
      {children}
    </AppErrorBoundary>
  );
}
