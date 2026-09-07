/**
 * Transferência de titularidade / cessão (P1).
 * Isolada de ReleaseLot, sale_lot_swaps e execute_sale_lot_swap.
 * P2 (preview) e P3 (seleção/plan) NÃO persistem nesta tabela.
 */

export const SALE_TITLE_TRANSFER_OPERATION_CODE = 'transferencia_titularidade' as const;

export const SALE_TITLE_TRANSFER_TABLE = 'sale_title_transfers';

export const TITLE_TRANSFER_DOCUMENT_PREFIX = 'TT';

export const SALE_TITLE_TRANSFER_STATUSES = [
  'CALCULATED',
  'EXECUTING',
  'EXECUTED',
  'FAILED',
] as const;

export type SaleTitleTransferStatus = (typeof SALE_TITLE_TRANSFER_STATUSES)[number];

export const SALE_TITLE_TRANSFER_INFLIGHT_STATUSES: readonly SaleTitleTransferStatus[] = [
  'CALCULATED',
  'EXECUTING',
];

export const TITLE_TRANSFER_SCHEDULE_MODES = ['ASSUME_CURRENT', 'RECALCULATE'] as const;

export type TitleTransferScheduleMode = (typeof TITLE_TRANSFER_SCHEDULE_MODES)[number];

export const TITLE_TRANSFER_LOT_REQUIRED_STATUS = 'Vendido';

export function isSaleTitleTransferOperation(code?: string | null): boolean {
  return String(code || '').trim() === SALE_TITLE_TRANSFER_OPERATION_CODE;
}

export function isSaleTitleTransferStatus(
  value?: string | null,
): value is SaleTitleTransferStatus {
  return SALE_TITLE_TRANSFER_STATUSES.includes(
    String(value || '').trim() as SaleTitleTransferStatus,
  );
}

export function isTitleTransferScheduleMode(
  value?: string | null,
): value is TitleTransferScheduleMode {
  return TITLE_TRANSFER_SCHEDULE_MODES.includes(
    String(value || '').trim() as TitleTransferScheduleMode,
  );
}
