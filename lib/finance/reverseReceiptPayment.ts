/**
 * Estorno de uma parcela paga.
 * Não apaga o recebível nem o caixa: a parcela volta a pendente e o caixa ativo fica estornado.
 * A auditoria guarda o valor e a data anteriores.
 */

export type ReceiptReversalLink = {
  id: string;
  receiptId?: string | null;
  status?: string | null;
  hasReceiptDocument?: boolean;
  provider?: string | null;
};

export type ReceiptReversalPlan = {
  ok: boolean;
  message: string;
  cashIds: string[];
  previous: {
    amount: number;
    paidAmount: number | null;
    paidAt: string | null;
    status: string;
  } | null;
};

const OPEN_CANCELLED = new Set(['CANCELLED', 'CANCELED', 'CANCELADO', 'ESTORNADO']);

function openStatus(status: unknown): boolean {
  const value = String(status || '').trim().toUpperCase();
  return value.length > 0 && !OPEN_CANCELLED.has(value);
}

function paidReceipt(status: unknown, paidAt: unknown): boolean {
  const value = String(status || '').trim().toLowerCase();
  return value === 'pago' || value === 'paid' || Boolean(paidAt);
}

export function planReceiptPaymentReversal(input: {
  receipt: {
    id: string;
    amount: number;
    paidAmount: number | null;
    paidAt: string | null;
    status: string;
  };
  cash: ReceiptReversalLink[];
  bankCharges: ReceiptReversalLink[];
  asaasCharges: ReceiptReversalLink[];
  commissions: ReceiptReversalLink[];
  reason: string;
}): ReceiptReversalPlan {
  const reason = input.reason.trim();
  const previous = {
    amount: input.receipt.amount,
    paidAmount: input.receipt.paidAmount,
    paidAt: input.receipt.paidAt,
    status: input.receipt.status,
  };
  if (reason.length < 10 || reason.length > 500) {
    return { ok: false, message: 'Informe uma justificativa entre 10 e 500 caracteres.', cashIds: [], previous };
  }
  if (!paidReceipt(input.receipt.status, input.receipt.paidAt)) {
    return { ok: false, message: 'Esta parcela já está pendente.', cashIds: [], previous };
  }
  const linked = (rows: ReceiptReversalLink[]) => rows.filter((row) => !row.receiptId || row.receiptId === input.receipt.id);
  if (linked(input.bankCharges).some((row) => openStatus(row.status))) {
    return { ok: false, message: 'Há cobrança bancária vinculada. Cancele a cobrança antes de estornar.', cashIds: [], previous };
  }
  if (linked(input.asaasCharges).some((row) => openStatus(row.status))) {
    return { ok: false, message: 'Há cobrança Asaas vinculada. Cancele a cobrança antes de estornar.', cashIds: [], previous };
  }
  const cash = linked(input.cash).filter((row) => openStatus(row.status));
  if (cash.some((row) => row.hasReceiptDocument)) {
    return { ok: false, message: 'Há recibo emitido. O estorno automático fica bloqueado.', cashIds: [], previous };
  }
  if (cash.some((row) => ['ASAAS', 'INTER', 'C6'].includes(String(row.provider || '').trim().toUpperCase()))) {
    return { ok: false, message: 'O caixa veio de uma cobrança bancária. Use o fluxo dessa cobrança.', cashIds: [], previous };
  }
  if (linked(input.commissions).some((row) => String(row.status || '').trim().toLowerCase() === 'pago' || String(row.status || '').trim().toLowerCase() === 'paid')) {
    return { ok: false, message: 'Há repasse ou comissão paga vinculada a esta parcela.', cashIds: [], previous };
  }
  return {
    ok: true,
    message: 'A parcela voltará a pendente. O lançamento de caixa, se existir, será estornado e não apagado.',
    cashIds: cash.map((row) => row.id),
    previous,
  };
}
