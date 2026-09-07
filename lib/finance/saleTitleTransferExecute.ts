/**
 * P4 — execução da Transferência de titularidade (constantes/puro).
 * Mutação crítica ocorre só na RPC execute_sale_title_transfer.
 * Sem ReleaseLot. Sem execute_sale_lot_swap. Sem geração de boleto/Pix.
 */

export const TITLE_TRANSFER_EXECUTE_RPC = 'execute_sale_title_transfer';
export const TITLE_TRANSFER_EXECUTE_CONFIRM_TEXT =
  'Entendo que o imóvel permanece vendido, os pagamentos e parcelas internas são preservados, as cobranças bancárias abertas do titular anterior serão canceladas e o saldo remanescente passará ao novo titular.';

export const TITLE_TRANSFER_CHARGES_NON_CANCELABLE = 'TITLE_TRANSFER_CHARGES_NON_CANCELABLE';
export const TITLE_TRANSFER_CHARGES_LIVE_DISABLED = 'TITLE_TRANSFER_CHARGES_LIVE_DISABLED';
export const TITLE_TRANSFER_CHARGES_CANCEL_FAILED = 'TITLE_TRANSFER_CHARGES_CANCEL_FAILED';
export const TITLE_TRANSFER_EXECUTE_DISABLED = 'TITLE_TRANSFER_EXECUTE_DISABLED';
export const TITLE_TRANSFER_CONFIRM_REQUIRED = 'TITLE_TRANSFER_CONFIRM_REQUIRED';
export { TITLE_TRANSFER_TITULAR_CHANGED } from '@/lib/finance/saleTitleTransferPlan';
export const TITLE_TRANSFER_INFLIGHT = 'TITLE_TRANSFER_INFLIGHT';

export type TitleTransferExecuteRpcPayload = {
  transfer_id: string;
  company_id: string;
  operator_user_id: string;
  idempotency_key: string;
  expected_from_customer_id: string;
  expected_to_customer_id: string;
  expected_contract_id: string | null;
  expected_block_id: string;
  retarget_receipt_ids: string[];
  new_contract: {
    generated_html: string;
    contract_number: string;
    contract_model: string | null;
    down_payment: number | null;
    installments: number;
    project_name_snapshot: string | null;
    project_city_snapshot: string | null;
    project_uf_snapshot: string | null;
    forum_city_snapshot: string | null;
  };
};

export type TitleTransferExecuteRpcResult = {
  ok: boolean;
  reused: boolean;
  status: string;
  transfer_id: string;
  sale_id: string;
  block_id: string;
  from_customer_id: string;
  to_customer_id: string;
  from_contract_id: string | null;
  to_contract_id: string | null;
  to_contract_number?: string | null;
  previous_transfer_id: string | null;
  sale_id_unchanged: boolean;
  block_id_unchanged: boolean;
  lot_still_sold: boolean;
  receipts_preserved: boolean;
  generate_charges: false;
};

export function parseTitleTransferExecuteRpcError(message: string): {
  code: string;
  message: string;
} {
  const raw = String(message || '').trim();
  const match = raw.match(/TITLE_TRANSFER_EXECUTE:([A-Z0-9_]+):(.*)$/);
  if (match) {
    return { code: match[1], message: String(match[2] || '').trim() || raw };
  }
  return { code: 'EXECUTE_FAILED', message: raw || 'Falha ao executar a transferência.' };
}

export function buildTitleTransferIdempotencyKey(input: {
  saleId: string;
  fromCustomerId: string;
  toCustomerId: string;
  contractId?: string | null;
}): string {
  return [
    String(input.saleId || '').trim(),
    String(input.fromCustomerId || '').trim(),
    String(input.toCustomerId || '').trim(),
    String(input.contractId || '').trim() || 'none',
  ].join(':');
}
