/**
 * Consulta oficial v2. Não grava recebível, caixa ou webhook.
 * CREATED e WAITING_CONFIRMATION não confirmam pagamento.
 */

import { decideC6BolepixV2Settlement, type C6BolepixV2Payment } from '@/lib/banking/c6/c6BolepixV2Status';

export type C6BolepixReconciliation = {
  writesFinance: false;
  settleCash: boolean;
  status: string;
  paymentType: 'BANK_SLIP' | 'PIX' | null;
  message: string;
};

export function reconcileC6BolepixV2Query(input: {
  status?: string | null;
  billingType?: string | null;
  payments?: Array<C6BolepixV2Payment & { externalPaymentId?: string | null }> | null;
  expectedCompanyId?: string | null;
  expectedIntegrationId?: string | null;
  expectedReceiptId?: string | null;
  companyId?: string | null;
  integrationId?: string | null;
  receiptId?: string | null;
  settledPaymentIds?: string[] | null;
}): C6BolepixReconciliation {
  const expectedCompany = String(input.expectedCompanyId || '');
  const expectedIntegration = String(input.expectedIntegrationId || '');
  const expectedReceipt = String(input.expectedReceiptId || '');
  if (
    (expectedCompany && input.companyId !== expectedCompany) ||
    (expectedIntegration && input.integrationId !== expectedIntegration) ||
    (expectedReceipt && input.receiptId !== expectedReceipt)
  ) {
    return {
      writesFinance: false,
      settleCash: false,
      status: String(input.status || 'UNKNOWN').toUpperCase(),
      paymentType: null,
      message: 'A consulta não pertence a esta empresa, integração ou parcela.',
    };
  }
  const decision = decideC6BolepixV2Settlement(input);
  const paymentId = String(input.payments?.find((item) => item.externalPaymentId)?.externalPaymentId || '');
  if (decision.settleCash && paymentId && (input.settledPaymentIds || []).includes(paymentId)) {
    return {
      writesFinance: false,
      settleCash: false,
      status: decision.status,
      paymentType: decision.paymentType,
      message: 'Este pagamento já foi conciliado.',
    };
  }
  return {
    writesFinance: false,
    settleCash: decision.settleCash,
    status: decision.status,
    paymentType: decision.paymentType,
    message: decision.message,
  };
}

export function reconcileC6BolepixV2Webhook(): C6BolepixReconciliation {
  return {
    writesFinance: false,
    settleCash: false,
    status: 'UNKNOWN',
    paymentType: null,
    message: 'O OpenAPI 1.2.0 não descreve o webhook do Bolepix. Nenhuma baixa foi feita.',
  };
}
