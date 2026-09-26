'use client';

import { useEffect } from 'react';
import { useAssistantUiStateOptional } from '@/contexts/AssistantUiStateContext';
import { sanitizePaymentModeHint, type AssistantSaleEditTab } from '@/lib/assistant/uiSnapshot';

type Props = {
  paymentMode?: string | null;
  customerSelected?: boolean;
  lotId?: string | null;
  projectId?: string | null;
  blockNumber?: string | null;
  lotNumber?: string | null;
  lotStatus?: string | null;
  installmentsFilled?: boolean;
  firstDueFilled?: boolean;
  brokerSelected?: boolean;
  downPaymentFilled?: boolean;
  isEditMode?: boolean;
  saleEditTab?: AssistantSaleEditTab | null;
};

export function AssistantSaleUiBridge({
  paymentMode,
  customerSelected,
  lotId,
  projectId,
  blockNumber,
  lotNumber,
  lotStatus,
  installmentsFilled,
  firstDueFilled,
  brokerSelected,
  downPaymentFilled,
  isEditMode = false,
  saleEditTab = null,
}: Props) {
  const ui = useAssistantUiStateOptional();
  const patchSale = ui?.patchSale;
  const patchLot = ui?.patchLot;
  const clearSale = ui?.clearSale;

  useEffect(() => {
    if (!patchSale) return;
    patchSale({
      saleFormOpen: !isEditMode,
      saleEditOpen: Boolean(isEditMode),
      saleEditTab: isEditMode ? saleEditTab : null,
      paymentMode: sanitizePaymentModeHint(paymentMode),
      customerSelected: Boolean(customerSelected),
      installmentsFilled: Boolean(installmentsFilled),
      firstDueFilled: Boolean(firstDueFilled),
      brokerSelected: Boolean(brokerSelected),
      downPaymentFilled: Boolean(downPaymentFilled),
      ...(isEditMode && saleEditTab !== 'cobrancas'
        ? {
            saleChargesReady: false,
            saleChargesMissing: null,
            saleChargesEligible: null,
            saleChargesGenerated: null,
            saleChargesPaid: null,
            saleChargesCancelled: null,
            saleChargesPending: null,
            saleChargesInstallments: null,
            saleChargesHasAccount: false,
          }
        : {}),
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
    installmentsFilled,
    firstDueFilled,
    brokerSelected,
    downPaymentFilled,
    isEditMode,
    saleEditTab,
    patchSale,
    patchLot,
    clearSale,
  ]);

  return null;
}
