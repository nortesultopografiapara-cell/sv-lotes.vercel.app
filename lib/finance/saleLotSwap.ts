/**
 * Troca de lote / Substituição de unidade — fundação (Fase 1).
 *
 * Isolada de ReleaseLot e de sale_release_settlements.
 * Sem POST de execução, sem PDF, sem mutação de venda/lote.
 *
 * Prefixo documental homologado: TL (RPC next_sale_operation_document_number).
 *
 * Atomicidade (Fase 4): mutação crítica em RPC Postgres
 * `execute_sale_lot_swap` (SECURITY DEFINER, SELECT … FOR UPDATE).
 * Não encadear UPDATEs independentes no cliente supabase-js.
 */

import {
  formatSaleOperationDocumentNumber,
  LOT_SWAP_DOCUMENT_PREFIX,
} from '@/lib/termination-documents/numbering';

export { LOT_SWAP_DOCUMENT_PREFIX };

export const SALE_LOT_SWAP_OPERATION_CODE = 'troca_lote' as const;

export const SALE_LOT_SWAP_TABLE = 'sale_lot_swaps';

export const SALE_LOT_SWAP_STATUSES = [
  'CALCULATED',
  'EXECUTING',
  'EXECUTED',
  'FAILED',
] as const;

export type SaleLotSwapStatus = (typeof SALE_LOT_SWAP_STATUSES)[number];

/** Em voo: retry reutiliza a linha. EXECUTED históricas podem repetir na mesma sale. */
export const SALE_LOT_SWAP_INFLIGHT_STATUSES: readonly SaleLotSwapStatus[] = [
  'CALCULATED',
  'EXECUTING',
];

export const SALE_DOCUMENT_TYPE_TROCA_LOTE = 'TROCA_LOTE';
export const SALE_DOCUMENT_TYPE_TROCA_LOTE_ASSINADO = 'TROCA_LOTE_ASSINADO';

export const SALE_DOCUMENT_LOT_SWAP_TYPES = [
  SALE_DOCUMENT_TYPE_TROCA_LOTE,
  SALE_DOCUMENT_TYPE_TROCA_LOTE_ASSINADO,
] as const;

export const LOT_SWAP_DOCUMENT_TITLE =
  'TERMO ADITIVO DE TROCA DE LOTE / SUBSTITUIÇÃO DE UNIDADE';

/** V1: somente o mesmo empreendimento. Destino precisa estar Disponível. */
export const LOT_SWAP_V1_SAME_PROJECT_ONLY = true;
export const LOT_SWAP_V1_DESTINATION_REQUIRED_STATUS = 'Disponível';
export const LOT_SWAP_V1_REJECTED_DESTINATION_STATUSES = ['Reservado'] as const;
export const LOT_SWAP_SOURCE_AFTER_EXECUTE_STATUS = 'Disponível';
export const LOT_SWAP_DESTINATION_AFTER_EXECUTE_STATUS = 'Vendido';

export const LOT_SWAP_CREDIT_EXCEEDS_PRICE = 'LOT_SWAP_CREDIT_EXCEEDS_PRICE';

export const LOT_SWAP_CREDIT_EXCEEDS_PRICE_MESSAGE =
  'O crédito acumulado nesta venda é superior ao valor do lote selecionado. Esta situação exige tratamento financeiro específico antes da troca.';

export const LOT_SWAP_SCHEDULE_PREVIEW_NOTICE =
  'O cronograma definitivo será calculado na próxima fase.';

export type SaleLotSwapFinancialInput = {
  oldSalePrice: number;
  newLotPrice: number;
  totalPaid: number;
  /**
   * Crédito a apropriar no preço da nova unidade.
   * V1: pagamentos efetivamente apropriados ao preço da aquisição.
   * Não classificar juros/multa/taxas nesta fase — o chamador informa o valor.
   */
  transferableCredit: number;
};

export type SaleLotSwapFinancialFields = {
  old_sale_price: number;
  new_lot_price: number;
  total_paid: number;
  transferable_credit: number;
  old_balance: number;
  price_difference: number;
  new_balance: number;
};

export type SaleLotSwapFinancialDerivation = {
  fields: SaleLotSwapFinancialFields;
  blocked: boolean;
  blockCode: typeof LOT_SWAP_CREDIT_EXCEEDS_PRICE | null;
};

function money2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function isSaleLotSwapOperation(code?: string | null): boolean {
  return String(code || '').trim() === SALE_LOT_SWAP_OPERATION_CODE;
}

export function isSaleLotSwapStatus(value?: string | null): value is SaleLotSwapStatus {
  return SALE_LOT_SWAP_STATUSES.includes(String(value || '').trim() as SaleLotSwapStatus);
}

export function isLotSwapDocumentType(documentType?: string | null): boolean {
  const type = String(documentType || '')
    .trim()
    .toUpperCase();
  return (SALE_DOCUMENT_LOT_SWAP_TYPES as readonly string[]).includes(type);
}

export function isSameProjectLotSwap(
  fromProjectId?: string | null,
  toProjectId?: string | null,
): boolean {
  const from = String(fromProjectId || '').trim();
  const to = String(toProjectId || '').trim();
  return Boolean(from) && from === to;
}

/**
 * V1: na ausência de classificação de juros/multa/taxas, o crédito transferível
 * coincide com os pagamentos apropriados ao preço. O total_paid permanece campo separado.
 */
export function v1TransferableCreditFromAppropriatedPayments(
  appropriatedToAcquisitionPrice: number,
): number {
  return money2(appropriatedToAcquisitionPrice);
}

export function lotSwapCreditExceedsNewPrice(
  transferableCredit: number,
  newLotPrice: number,
): boolean {
  return money2(transferableCredit) > money2(newLotPrice);
}

export function deriveSaleLotSwapFinancials(
  input: SaleLotSwapFinancialInput,
): SaleLotSwapFinancialDerivation {
  const old_sale_price = money2(input.oldSalePrice);
  const new_lot_price = money2(input.newLotPrice);
  const total_paid = money2(input.totalPaid);
  const transferable_credit = money2(input.transferableCredit);
  const old_balance = money2(old_sale_price - total_paid);
  const price_difference = money2(new_lot_price - old_sale_price);
  const new_balance = money2(new_lot_price - transferable_credit);
  const blocked = lotSwapCreditExceedsNewPrice(transferable_credit, new_lot_price);
  return {
    fields: {
      old_sale_price,
      new_lot_price,
      total_paid,
      transferable_credit,
      old_balance,
      price_difference,
      new_balance,
    },
    blocked,
    blockCode: blocked ? LOT_SWAP_CREDIT_EXCEEDS_PRICE : null,
  };
}

/** Persistência de execução exige new_balance >= 0. Sem restituição automática. */
export function assertSaleLotSwapFinancialsPersistable(
  derivation: SaleLotSwapFinancialDerivation,
): void {
  if (derivation.blocked || derivation.fields.new_balance < 0) {
    throw new Error(LOT_SWAP_CREDIT_EXCEEDS_PRICE);
  }
}

export function formatLotSwapDocumentNumber(seq: number, year: number): string {
  return formatSaleOperationDocumentNumber(LOT_SWAP_DOCUMENT_PREFIX, seq, year);
}

export function isLotSwapV1DestinationStatusAllowed(status?: string | null): boolean {
  const raw = String(status || '').trim();
  if (!raw) return false;
  if (
    (LOT_SWAP_V1_REJECTED_DESTINATION_STATUSES as readonly string[]).includes(raw)
  ) {
    return false;
  }
  return raw === LOT_SWAP_V1_DESTINATION_REQUIRED_STATUS;
}
