'use client';

import { useEffect } from 'react';
import { useAssistantUiStateOptional } from '@/contexts/AssistantUiStateContext';
import type { AssistantLotTab } from '@/lib/assistant/uiSnapshot';

type Props = {
  lotId?: string | null;
  projectId?: string | null;
  blockNumber?: string | null;
  lotNumber?: string | null;
  lotStatus?: string | null;
  activeLotTab?: AssistantLotTab | null;
};

export function AssistantLotUiBridge({
  lotId,
  projectId,
  blockNumber,
  lotNumber,
  lotStatus,
  activeLotTab,
}: Props) {
  const ui = useAssistantUiStateOptional();
  const patchLot = ui?.patchLot;
  const clearLot = ui?.clearLot;

  useEffect(() => {
    if (!patchLot) return;
    patchLot({
      lotId: lotId || null,
      projectId: projectId || null,
      lotModalOpen: true,
      activeLotTab: activeLotTab || 'resumo',
      blockNumber: blockNumber || null,
      lotNumber: lotNumber || null,
      lotStatus: lotStatus || null,
    });
    return () => clearLot?.();
  }, [lotId, projectId, blockNumber, lotNumber, lotStatus, activeLotTab, patchLot, clearLot]);

  return null;
}
