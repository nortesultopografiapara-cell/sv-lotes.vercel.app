/**
 * Classificação das cobranças da Transferência de titularidade.
 * Usa a cobrança vigente por finance_receipt. Não escolhe duplicata
 * silenciosamente. Cobranças órfãs (sem parcela vigente) não entram
 * na contagem "abertas a cancelar".
 */

import { isCanceledFinanceReceipt } from '@/lib/finance/saleChargesShared';
import type { ExternalChargeRecord } from '@/lib/finance/externalCharges/types';

export const TITLE_TRANSFER_AMBIGUOUS_OPEN_CHARGES =
  'TITLE_TRANSFER_AMBIGUOUS_OPEN_CHARGES';
export const TITLE_TRANSFER_ORPHAN_OPEN_CHARGES =
  'TITLE_TRANSFER_ORPHAN_OPEN_CHARGES';

export const TITLE_TRANSFER_AMBIGUOUS_OPEN_CHARGES_MESSAGE =
  'Há mais de uma cobrança bancária ativa para a mesma parcela. A transferência não escolhe silenciosamente qual cancelar.';

export const TITLE_TRANSFER_ORPHAN_OPEN_CHARGES_MESSAGE =
  'Há cobrança bancária ativa sem vínculo com parcela vigente (emissão anterior ou parcela recriada). A transferência não a inclui nas abertas a cancelar e não segue até essas órfãs serem resolvidas.';

function isActiveExternalCharge(row: ExternalChargeRecord): boolean {
  return row.classification === 'paid' || row.classification === 'cancelable';
}

export type TitleTransferChargeBuckets = {
  paid: ExternalChargeRecord[];
  open: ExternalChargeRecord[];
  cancelledReusable: ExternalChargeRecord[];
  nonCancelable: ExternalChargeRecord[];
  orphans: ExternalChargeRecord[];
  ambiguousReceiptIds: string[];
  blockCode: string | null;
  blockMessage: string | null;
};

export function currentTitleTransferReceiptIds(
  receipts: Array<{ id?: string | null; status?: string | null }>,
): Set<string> {
  const ids = new Set<string>();
  for (const row of receipts || []) {
    if (isCanceledFinanceReceipt(row)) continue;
    const id = String(row.id || '').trim();
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * Conta só a cobrança ligada à parcela vigente.
 * Duplicata na mesma parcela → bloqueio.
 * Órfã (finance_receipt_id nulo ou parcela cancelada/apagada) → bloqueio,
 * sem inflar "abertas a cancelar".
 */
export function reduceTitleTransferExternalCharges(input: {
  receipts: Array<{ id?: string | null; status?: string | null }>;
  charges: ExternalChargeRecord[];
}): TitleTransferChargeBuckets {
  const currentIds = currentTitleTransferReceiptIds(input.receipts);
  const paid: ExternalChargeRecord[] = [];
  const open: ExternalChargeRecord[] = [];
  const cancelledReusable: ExternalChargeRecord[] = [];
  const nonCancelable: ExternalChargeRecord[] = [];
  const orphans: ExternalChargeRecord[] = [];
  const byReceipt = new Map<string, ExternalChargeRecord[]>();

  for (const row of input.charges || []) {
    const receiptId = String(row.receiptId || '').trim();
    if (!receiptId || !currentIds.has(receiptId)) {
      if (isActiveExternalCharge(row)) orphans.push(row);
      else if (row.classification === 'absent') cancelledReusable.push(row);
      else if (row.classification === 'non_cancelable') nonCancelable.push(row);
      continue;
    }
    const list = byReceipt.get(receiptId) || [];
    list.push(row);
    byReceipt.set(receiptId, list);
  }

  const ambiguousReceiptIds: string[] = [];
  for (const [receiptId, rows] of byReceipt) {
    const active = rows.filter(isActiveExternalCharge);
    if (active.length > 1) {
      ambiguousReceiptIds.push(receiptId);
      continue;
    }
    for (const row of rows) {
      if (row.classification === 'paid') paid.push(row);
      else if (row.classification === 'cancelable') open.push(row);
      else if (row.classification === 'absent') cancelledReusable.push(row);
      else nonCancelable.push(row);
    }
  }

  let blockCode: string | null = null;
  let blockMessage: string | null = null;
  if (ambiguousReceiptIds.length > 0) {
    blockCode = TITLE_TRANSFER_AMBIGUOUS_OPEN_CHARGES;
    blockMessage = TITLE_TRANSFER_AMBIGUOUS_OPEN_CHARGES_MESSAGE;
  } else if (orphans.length > 0) {
    blockCode = TITLE_TRANSFER_ORPHAN_OPEN_CHARGES;
    blockMessage = TITLE_TRANSFER_ORPHAN_OPEN_CHARGES_MESSAGE;
  }

  return {
    paid,
    open,
    cancelledReusable,
    nonCancelable,
    orphans,
    ambiguousReceiptIds,
    blockCode,
    blockMessage,
  };
}
