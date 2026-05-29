'use client';

import { useEffect } from 'react';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { registerGlobalErrorHandlers } from '@/lib/appErrorReporting';

export function AppProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    registerGlobalErrorHandlers();
  }, []);

  return <AppErrorBoundary>{children}</AppErrorBoundary>;
}
