'use client';

import { useEffect } from 'react';
import { useAssistantUiStateOptional } from '@/contexts/AssistantUiStateContext';

export function AssistantContractUiBridge({ contractId }: { contractId?: string | null }) {
  const ui = useAssistantUiStateOptional();
  const patchContract = ui?.patchContract;
  const clearContract = ui?.clearContract;

  useEffect(() => {
    if (!patchContract) return;
    if (contractId) {
      patchContract({ contractId });
    } else {
      clearContract?.();
    }
    return () => clearContract?.();
  }, [contractId, patchContract, clearContract]);

  return null;
}
