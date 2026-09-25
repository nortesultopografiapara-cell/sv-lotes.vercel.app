'use client';

import { useEffect } from 'react';
import { useAssistantUiStateOptional } from '@/contexts/AssistantUiStateContext';
import { sanitizePaymentModeHint } from '@/lib/assistant/uiSnapshot';

type Props = {
  paymentMode?: string | null;
  customerSelected?: boolean;
  lotId?: string | null;
  projectId?: string | null;
  blockNumber?: string | null;
  lotNumber?: string | null;
  lotStatus?: string | null;
};

export function AssistantSaleUiBridge({
  paymentMode,
  customerSelected,
  lotId,
  projectId,
  blockNumber,
  lotNumber,
  lotStatus,
}: Props) {
  const ui = useAssistantUiStateOptional();
  const patchSale = ui?.patchSale;
  const patchLot = ui?.patchLot;
  const clearSale = ui?.clearSale;

  useEffect(() => {
    if (!patchSale) return;
    patchSale({
      saleFormOpen: true,
      paymentMode: sanitizePaymentModeHint(paymentMode),
      customerSelected: Boolean(customerSelected),
    });
    patchLot?.({
      lotId: lotId || null,
      projectId: projectId || null,
      blockNumber: blockNumber || null,
      lotNumber: lotNumber || null,
      lotStatus: lotStatus || null,
    });
    return () => clearSale?.();
  }, [
    paymentMode,
    customerSelected,
    lotId,
    projectId,
    blockNumber,
    lotNumber,
    lotStatus,
    patchSale,
    patchLot,
    clearSale,
  ]);

  return null;
}
