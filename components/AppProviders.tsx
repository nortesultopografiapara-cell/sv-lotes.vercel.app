'use client';

import { useEffect } from 'react';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { registerGlobalErrorHandlers } from '@/lib/appErrorReporting';
import { ServiceWorkerRegister } from '@/components/offline/ServiceWorkerRegister';
import { registerOfflineCacheDebug } from '@/lib/offline/offlineCacheDebug';
import { ThemeProvider } from '@/contexts/ThemeContext';

export function AppProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    registerGlobalErrorHandlers();
    registerOfflineCacheDebug();
  }, []);

  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <ServiceWorkerRegister />
        {children}
      </ThemeProvider>
    </AppErrorBoundary>
  );
}
