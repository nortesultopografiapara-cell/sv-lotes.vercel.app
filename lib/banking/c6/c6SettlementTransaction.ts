/**
 * Espelho local da RPC settle_company_c6_bank_slip.
 * A escrita real acontece só dentro da função SQL, numa transação.
 * Este módulo serve aos testes e não é chamado em Production.
 */

export const SETTLE_COMPANY_C6_BANK_SLIP_RPC = 'settle_company_c6_bank_slip';

const ELIGIBLE = new Set(['pendente', 'atrasado', 'overdue', 'vencido']);
const CANCELLED = new Set(['cancelado', 'canceled', 'cancelled', 'cancelada']);
const PAID = new Set(['pago', 'paid']);

export type C6SettlementTxnCode =
  | 'settled'
  | 'duplicate'
  | 'cancelled'
  | 'reversed'
  | 'already_paid'
  | 'divergent'
  | 'foreign_company'
  | 'mismatch'
  | 'ineligible'
  | 'not_found';

export type C6SettlementTxnResult = {
  code: C6SettlementTxnCode;
  cashMovementId: string | null;
  receiptUpdated: boolean;
};

type Row = Record<string, unknown> & { id?: string };
type Tables = Record<string, Row[]>;

const queues = new WeakMap<object, Promise<unknown>>();

function money(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function meta(row: Row): Record<string, unknown> {
  return row.metadata && typeof row.metadata === 'object' ? (row.metadata as Record<string, unknown>) : {};
}

function applySync(
  tables: Tables,
  input: {
    companyId: string;
    chargeId: string;
    receiptId: string;
    integrationId: string;
    financialAccountId: string;
    bankSlipId: string;
    paidAmount: number;
    paidOn: string;
    failBeforeCash?: boolean;
    failDuringCash?: boolean;
  },
): C6SettlementTxnResult {
  const draft: Tables = structuredClone(tables);
  const receipts = draft.finance_receipts || [];
  const receipt = receipts.find((row) => row.id === input.receiptId);
  if (!receipt) return { code: 'not_found', cashMovementId: null, receiptUpdated: false };
  const owner = String(receipt.company_id || receipt.tenant_id || '');
  if (owner !== input.companyId) return { code: 'foreign_company', cashMovementId: null, receiptUpdated: false };

  const charge = (draft.bank_charges || []).find((row) => row.id === input.chargeId);
  if (
    !charge ||
    String(charge.company_id || '') !== input.companyId ||
    String(charge.provider || '') !== 'C6' ||
    String(charge.finance_receipt_id || '') !== input.receiptId ||
    String(charge.integration_id || '') !== input.integrationId ||
    String(charge.external_id || '') !== input.bankSlipId
  ) {
    return { code: 'mismatch', cashMovementId: null, receiptUpdated: false };
  }

  const accountId = String(input.financialAccountId || receipt.financial_account_id || '');
  const account = (draft.company_financial_accounts || []).find((row) => row.id === accountId);
  const integration = (draft.bank_integrations || []).find((row) => row.id === input.integrationId);
  if (
    !account ||
    String(account.company_id || '') !== input.companyId ||
    String(account.bank_integration_id || '') !== input.integrationId ||
    (receipt.financial_account_id && String(receipt.financial_account_id) !== accountId) ||
    !integration ||
    String(integration.company_id || '') !== input.companyId ||
    String(integration.provider || '').toUpperCase() !== 'C6'
  ) {
    return { code: 'mismatch', cashMovementId: null, receiptUpdated: false };
  }

  const movements = draft.cash_movements || (draft.cash_movements = []);
  const linked = movements.filter((row) => {
    if (String(row.company_id || '') !== input.companyId) return false;
    const box = meta(row);
    return box.installment_id === input.receiptId || box.bank_charge_id === input.chargeId;
  });
  if (linked.some((row) => String(row.status || '').toLowerCase() === 'estornado')) {
    return { code: 'reversed', cashMovementId: null, receiptUpdated: false };
  }
  const active = linked.find((row) => {
    const box = meta(row);
    return (
      String(row.status || 'ativo').toLowerCase() === 'ativo' &&
      box.provider === 'C6' &&
      box.bank_charge_id === input.chargeId
    );
  });
  const status = String(receipt.status || '').trim().toLowerCase();
  if (CANCELLED.has(status)) return { code: 'cancelled', cashMovementId: null, receiptUpdated: false };
  if (PAID.has(status)) {
    if (active?.id) return { code: 'duplicate', cashMovementId: String(active.id), receiptUpdated: false };
    return { code: 'already_paid', cashMovementId: null, receiptUpdated: false };
  }
  if (!ELIGIBLE.has(status)) return { code: 'ineligible', cashMovementId: null, receiptUpdated: false };
  const expected = money(receipt.amount);
  const paid = money(input.paidAmount);
  if (expected == null || paid == null || Math.abs(expected - paid) >= 0.001) {
    return { code: 'divergent', cashMovementId: null, receiptUpdated: false };
  }

  receipt.status = 'pago';
  receipt.paid_amount = paid;
  receipt.paid_at = input.paidOn;
  if (input.failBeforeCash) throw new Error('Falha simulada antes do caixa.');

  if (input.failDuringCash) throw new Error('Falha simulada durante o caixa.');
  const cashId = `cash-${movements.length + 1}`;
  movements.push({
    id: cashId,
    tenant_id: input.companyId,
    company_id: input.companyId,
    project_id: receipt.project_id || null,
    type: 'entrada',
    category: 'recebimento_parcela',
    description: `Recebimento C6 Bank — parcela ${receipt.installment_number ?? ''}`.trim(),
    amount: paid,
    customer_id: receipt.customer_id || null,
    sale_id: receipt.sale_id || null,
    movement_date: input.paidOn.slice(0, 10),
    status: 'ativo',
    metadata: {
      provider: 'C6',
      bank_charge_id: input.chargeId,
      installment_id: input.receiptId,
      bank_slip_id: input.bankSlipId,
    },
  });
  charge.status = 'PAID';
  const audits = draft.audit_logs || (draft.audit_logs = []);
  audits.push({
    id: `audit-${audits.length + 1}`,
    tenant_id: input.companyId,
    company_id: input.companyId,
    action: 'c6_boleto_settlement',
    module: 'FINANCE',
    reference_id: input.receiptId,
    description: `Baixa C6 ${input.bankSlipId} valor ${paid}`,
  });

  for (const key of Object.keys(draft)) tables[key] = draft[key];
  return { code: 'settled', cashMovementId: cashId, receiptUpdated: true };
}

export async function applyC6SettlementTransaction(
  tables: Tables,
  input: {
    companyId: string;
    chargeId: string;
    receiptId: string;
    integrationId: string;
    financialAccountId: string;
    bankSlipId: string;
    paidAmount: number;
    paidOn: string;
    failBeforeCash?: boolean;
    failDuringCash?: boolean;
  },
): Promise<C6SettlementTxnResult> {
  const previous = queues.get(tables) || Promise.resolve();
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  queues.set(
    tables,
    previous.then(() => gate),
  );
  await previous;
  try {
    return applySync(tables, input);
  } finally {
    release();
  }
}
