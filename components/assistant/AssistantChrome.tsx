'use client';

import type { ReactNode } from 'react';
import { AssistantPanelProvider } from '@/contexts/AssistantPanelContext';
import { AssistantUiStateProvider } from '@/contexts/AssistantUiStateContext';
import { AssistantPanel } from '@/components/assistant/AssistantPanel';
import { AssistantOverlayFab } from '@/components/assistant/AssistantOverlayFab';

type Props = {
  children: ReactNode;
  role?: string | null;
  tenantName?: string | null;
  impersonatingTenant?: boolean;
};

export function AssistantChrome({ children, role, tenantName, impersonatingTenant }: Props) {
  return (
    <AssistantUiStateProvider>
      <AssistantPanelProvider
        role={role}
        tenantName={tenantName}
        impersonatingTenant={Boolean(impersonatingTenant)}
      >
        {children}
        <AssistantOverlayFab />
        <AssistantPanel />
      </AssistantPanelProvider>
    </AssistantUiStateProvider>
  );
}
