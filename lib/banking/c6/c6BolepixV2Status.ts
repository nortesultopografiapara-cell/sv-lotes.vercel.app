/**
 * Decisão de baixa a partir do GET /v2/bank_slips/{external_reference_id}.
 * Não grava recebível nem caixa. O OpenAPI 1.2.0 não descreve o corpo do webhook.
 */

import { C6_BOLEPIX_V2_STATUS_MEANING } from '@/lib/banking/c6/c6BolepixV2OpenApi';

export type C6BolepixV2Payment = {
  amount: string;
  paymentType: 'BANK_SLIP' | 'PIX' | string;
  paymentDate: string;
};

export type C6BolepixV2SettlementDecision = {
  settleCash: boolean;
  status: string;
  paymentType: 'BANK_SLIP' | 'PIX' | null;
  message: string;
};

export function decideC6BolepixV2Settlement(input: {
  status?: string | null;
  billingType?: string | null;
  payments?: C6BolepixV2Payment[] | null;
}): C6BolepixV2SettlementDecision {
  const status = String(input.status || '').toUpperCase();
  const payment = (input.payments || []).find((item) => item.paymentType === 'BANK_SLIP' || item.paymentType === 'PIX');
  if (status === 'PAID' && payment) {
    return {
      settleCash: true,
      status,
      paymentType: payment.paymentType as 'BANK_SLIP' | 'PIX',
      message: `Liquidação oficial por ${payment.paymentType === 'PIX' ? 'Pix' : 'boleto'}.`,
    };
  }
  if (status === 'WAITING_CONFIRMATION') {
    return {
      settleCash: false,
      status,
      paymentType: null,
      message: C6_BOLEPIX_V2_STATUS_MEANING.WAITING_CONFIRMATION,
    };
  }
  if (status === 'CANCELED') {
    return { settleCash: false, status, paymentType: null, message: C6_BOLEPIX_V2_STATUS_MEANING.CANCELED };
  }
  if (status === 'CREATED') {
    const registered = input.billingType === '3';
    return {
      settleCash: false,
      status,
      paymentType: null,
      message: registered
        ? 'O C6 devolveu a modalidade de cobrança registrada. CREATED continua sem baixa.'
        : C6_BOLEPIX_V2_STATUS_MEANING.CREATED,
    };
  }
  return {
    settleCash: false,
    status: status || 'UNKNOWN',
    paymentType: null,
    message: 'Evento C6 inconclusivo. Nenhuma baixa foi feita.',
  };
}

export function c6BolepixV2CanShare(input: {
  status?: string | null;
  billingType?: string | null;
  digitableLine?: string | null;
  pixCopyPaste?: string | null;
}): boolean {
  const status = String(input.status || '').toUpperCase();
  const hasInstrument = Boolean(String(input.digitableLine || '').trim() || String(input.pixCopyPaste || '').trim());
  return status === 'CREATED' && input.billingType === '3' && hasInstrument;
}
