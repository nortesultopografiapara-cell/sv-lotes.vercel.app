'use client';

import type { ReactNode } from 'react';
import { AssistantPanelProvider } from '@/contexts/AssistantPanelContext';
import { AssistantPanel } from '@/components/assistant/AssistantPanel';

type Props = {
  children: ReactNode;
  role?: string | null;
  tenantName?: string | null;
  impersonatingTenant?: boolean;
};

export function AssistantChrome({ children, role, tenantName, impersonatingTenant }: Props) {
  return (
    <AssistantPanelProvider
      role={role}
      tenantName={tenantName}
      impersonatingTenant={Boolean(impersonatingTenant)}
    >
      {children}
      <AssistantPanel />
    </AssistantPanelProvider>
  );
}
