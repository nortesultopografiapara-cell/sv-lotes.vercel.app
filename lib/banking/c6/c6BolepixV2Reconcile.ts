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
  payments?: C6BolepixV2Payment[] | null;
}): C6BolepixReconciliation {
  const decision = decideC6BolepixV2Settlement(input);
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
