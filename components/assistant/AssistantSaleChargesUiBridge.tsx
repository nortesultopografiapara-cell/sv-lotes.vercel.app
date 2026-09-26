'use client';

import { useEffect } from 'react';
import { useAssistantUiStateOptional } from '@/contexts/AssistantUiStateContext';
import type { SaleChargesSummary } from '@/lib/finance/saleChargesShared';

type Props = {
  summary: SaleChargesSummary | null;
};

export function AssistantSaleChargesUiBridge({ summary }: Props) {
  const ui = useAssistantUiStateOptional();
  const patchSale = ui?.patchSale;

  useEffect(() => {
    if (!patchSale) return;
    if (!summary) {
      patchSale({ saleChargesReady: false });
      return;
    }
    patchSale({
      saleChargesReady: true,
      saleChargesHasAccount: Boolean(summary.hasFinancialAccount),
      saleChargesMissing: summary.chargesMissing,
      saleChargesEligible: summary.eligibleInstallments,
      saleChargesGenerated: summary.chargesGenerated,
      saleChargesPaid: summary.paidInstallments,
      saleChargesCancelled: summary.chargesCancelled,
      saleChargesPending: Math.max(0, summary.totalInstallments - summary.paidInstallments),
      saleChargesInstallments: summary.totalInstallments,
    });
  }, [patchSale, summary]);

  return null;
}
