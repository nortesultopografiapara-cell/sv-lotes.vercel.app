'use client';

import { useLayoutEffect } from 'react';
import { useAssistantUiStateOptional } from '@/contexts/AssistantUiStateContext';

export function AssistantContractUiBridge({ contractId }: { contractId?: string | null }) {
  const ui = useAssistantUiStateOptional();
  const patchContract = ui?.patchContract;
  const clearContract = ui?.clearContract;
  const nextId = contractId ? String(contractId) : null;

  useLayoutEffect(() => {
    if (!patchContract) return;
    if (nextId) {
      patchContract({ contractId: nextId });
      return;
    }
    clearContract?.();
  }, [nextId, patchContract, clearContract]);

  return null;
}
