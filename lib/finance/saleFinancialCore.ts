/**
 * Núcleo financeiro da venda.
 * A gravação real acontece em create_sale_financial_core, numa transação.
 * Este módulo valida a chave, chama a função e descreve a repetição do contrato.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const SALE_FINANCIAL_CORE_RPC = 'create_sale_financial_core';

export const SALE_CONTRACT_PENDING_MESSAGE =
  'A venda e o lote já foram confirmados, mas o contrato não foi gerado. Repita a mesma operação para concluir o contrato. O lote não foi liberado.';

export class SaleFinancialCoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaleFinancialCoreError';
  }
}

export function assertSaleRequestKey(value: unknown): string {
  const key = String(value || '').trim().toLowerCase();
  if (!UUID_RE.test(key)) {
    throw new SaleFinancialCoreError('A chave da venda é obrigatória e precisa ser estável.');
  }
  return key;
}

type SaleRequestStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function saleRequestStorageId(tenantId: string, lotId: string): string {
  return `sv-sale-request:${String(tenantId || '').trim()}:${String(lotId || '').trim()}`;
}

export function loadSaleRequestKey(
  storages: SaleRequestStorage[],
  tenantId: string,
  lotId: string,
): string | null {
  const id = saleRequestStorageId(tenantId, lotId);
  for (const storage of storages) {
    try {
      const value = storage.getItem(id);
      if (value) return assertSaleRequestKey(value);
    } catch {
      // armazenamento indisponível ou chave inválida
    }
  }
  return null;
}

export function persistSaleRequestKey(
  storages: SaleRequestStorage[],
  tenantId: string,
  lotId: string,
  key: string,
): string {
  const valid = assertSaleRequestKey(key);
  const id = saleRequestStorageId(tenantId, lotId);
  for (const storage of storages) {
    try {
      storage.setItem(id, valid);
    } catch {
      // segue para o próximo armazenamento
    }
  }
  return valid;
}

export function clearSaleRequestKey(
  storages: SaleRequestStorage[],
  tenantId: string,
  lotId: string,
): void {
  const id = saleRequestStorageId(tenantId, lotId);
  for (const storage of storages) {
    try {
      storage.removeItem(id);
    } catch {
      // armazenamento indisponível
    }
  }
}

function cents(value: unknown): string {
  if (value == null || String(value).trim() === '') return '';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '';
  return String(Math.round(parsed * 100));
}

export function saleFinancialFingerprint(
  sale: Record<string, unknown>,
  receipts: Array<Record<string, unknown>>,
): string {
  const lines = [...receipts]
    .sort((left, right) => {
      const group = String(left.schedule_group || '').localeCompare(String(right.schedule_group || ''));
      if (group !== 0) return group;
      return Number(left.installment_number || 0) - Number(right.installment_number || 0);
    })
    .map((row) => [
      String(row.schedule_group || ''),
      String(row.installment_number ?? ''),
      cents(row.amount ?? 0),
      cents(row.paid_amount),
      String(row.status || ''),
      String(row.due_date || ''),
    ].join(':'))
    .join(';');
  return [
    'v1',
    String(sale.tenant_id || ''),
    String(sale.block_id || ''),
    String(sale.customer_id || ''),
    String(sale.project_id || ''),
    cents(sale.total_value),
    cents(sale.down_payment),
    cents(sale.signal_contract_value),
    cents(sale.signal_paid_at_sale),
    String(sale.installments_count ?? ''),
    String(sale.signal_schedule_mode || ''),
    lines,
  ].join('|');
}

export type SaleFinancialCoreResult = {
  saleId: string;
  replayed: boolean;
  cashId: string | null;
  cashAmount: number | null;
  contractId: string | null;
  receipts: Array<Record<string, unknown>>;
};

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>;
};

function messageOf(error: { message?: string } | null, data: unknown): string {
  const body = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  return String(error?.message || body.message || '');
}

export function mapSaleFinancialCoreError(message: string): SaleFinancialCoreError {
  if (/could not find the function|schema cache|PGRST202/i.test(message)) {
    return new SaleFinancialCoreError(
      'A gravação transacional da venda ainda não está disponível neste ambiente.',
    );
  }
  if (/SALE_REQUEST_MISMATCH/i.test(message)) {
    return new SaleFinancialCoreError(
      'A chave já foi usada com empresa, lote, comprador ou valores diferentes.',
    );
  }
  if (/LOT_ALREADY_SOLD/i.test(message)) {
    return new SaleFinancialCoreError('Este lote já possui venda registrada.');
  }
  if (/SALE_CORE_CUSTOMER/i.test(message)) {
    return new SaleFinancialCoreError('O comprador não pertence a esta empresa.');
  }
  if (/SALE_CORE_PROJECT/i.test(message)) {
    return new SaleFinancialCoreError('O empreendimento não pertence a esta empresa.');
  }
  if (/SALE_CORE_CASH/i.test(message)) {
    return new SaleFinancialCoreError('A entrada inicial do caixa é inconsistente.');
  }
  const tail = message.split(':').slice(1).join(':').trim();
  return new SaleFinancialCoreError(tail || 'Falha ao gravar a venda. Nenhuma gravação financeira foi mantida.');
}

export async function invokeSaleFinancialCore(
  supabase: RpcClient,
  input: {
    sale: Record<string, unknown>;
    receipts: Array<Record<string, unknown>>;
    requestKey: string;
    userId?: string | null;
  },
): Promise<SaleFinancialCoreResult> {
  const requestKey = assertSaleRequestKey(input.requestKey);
  const { data, error } = await supabase.rpc(SALE_FINANCIAL_CORE_RPC, {
    p_sale: input.sale,
    p_receipts: input.receipts,
    p_request_key: requestKey,
    p_user_id: input.userId || null,
  });
  if (error) throw mapSaleFinancialCoreError(messageOf(error, data));
  const body = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  const saleId = String(body.sale_id || '').trim();
  const receipts = Array.isArray(body.receipts) ? body.receipts as Array<Record<string, unknown>> : [];
  if (!saleId || receipts.length !== input.receipts.length) {
    throw new SaleFinancialCoreError('Falha ao gravar a venda. Nenhuma gravação financeira foi mantida.');
  }
  return {
    saleId,
    replayed: body.replayed === true,
    cashId: body.cash_id ? String(body.cash_id) : null,
    cashAmount: body.cash_amount == null ? null : Number(body.cash_amount),
    contractId: body.contract_id ? String(body.contract_id) : null,
    receipts,
  };
}

export type CoreContractRow = {
  id: string;
  saleId: string;
  tenantId: string;
  current: boolean;
};

export function resolveContractRetry(
  saleId: string,
  tenantId: string,
  contracts: CoreContractRow[],
): { action: 'reuse' | 'create'; contractId: string | null } {
  const own = contracts.filter((row) => row.saleId === saleId && row.tenantId === tenantId && row.current);
  const otherSale = contracts.filter((row) => row.saleId !== saleId && row.current);
  if (own.length > 1) {
    throw new SaleFinancialCoreError('Esta venda já tem mais de um contrato vigente.');
  }
  if (own.length === 1) return { action: 'reuse', contractId: own[0].id };
  void otherSale;
  return { action: 'create', contractId: null };
}

export type MemoryCoreState = {
  sales: Array<Record<string, unknown>>;
  receipts: Array<Record<string, unknown>>;
  cash: Array<Record<string, unknown>>;
  lots: Array<Record<string, unknown>>;
  contracts: CoreContractRow[];
  customers: Array<{ id: string; tenantId: string }>;
  projects: Array<{ id: string; tenantId: string }>;
};

export function applySaleFinancialCore(
  state: MemoryCoreState,
  input: {
    sale: Record<string, unknown>;
    receipts: Array<Record<string, unknown>>;
    requestKey: string;
    failAt?: 'sale' | 'receipts' | 'cash' | 'lot' | null;
  },
): { state: MemoryCoreState; result: SaleFinancialCoreResult } {
  const requestKey = assertSaleRequestKey(input.requestKey);
  const tenantId = String(input.sale.tenant_id || '');
  const lotId = String(input.sale.block_id || '');
  const customerId = String(input.sale.customer_id || '');
  const projectId = String(input.sale.project_id || '');
  if (!state.customers.some((row) => row.id === customerId && row.tenantId === tenantId)) {
    throw new SaleFinancialCoreError('O comprador não pertence a esta empresa.');
  }
  if (!state.projects.some((row) => row.id === projectId && row.tenantId === tenantId)) {
    throw new SaleFinancialCoreError('O empreendimento não pertence a esta empresa.');
  }
  const lot = state.lots.find((row) => row.id === lotId && row.tenantId === tenantId && row.projectId === projectId);
  if (!lot) throw new SaleFinancialCoreError('O lote não pertence a esta empresa e a este empreendimento.');

  for (const row of input.receipts) {
    const paid = row.paid_amount == null || String(row.paid_amount) === '' ? null : Number(row.paid_amount);
    const amount = Number(row.amount);
    if (amount < 0 || (paid != null && (paid < 0 || paid > amount))) {
      throw new SaleFinancialCoreError('Recebível inconsistente, negativo ou de outra empresa.');
    }
    if (String(row.tenant_id || tenantId) !== tenantId) {
      throw new SaleFinancialCoreError('Recebível inconsistente, negativo ou de outra empresa.');
    }
  }
  const confirmed = input.receipts.filter((row) => {
    const paid = Number(row.paid_amount);
    return Number(row.installment_number) === 0
      && ['pago', 'paid', 'paga'].includes(String(row.status || '').toLowerCase())
      && Number.isFinite(paid)
      && paid > 0;
  });
  if (confirmed.length > 1) throw new SaleFinancialCoreError('A entrada inicial do caixa é inconsistente.');

  const fingerprint = saleFinancialFingerprint(input.sale, input.receipts);
  const existing = state.sales.find((row) => row.tenantId === tenantId && row.requestKey === requestKey);
  if (existing) {
    if (
      existing.fingerprint !== fingerprint
      || existing.lotId !== lotId
      || existing.customerId !== customerId
      || existing.projectId !== projectId
    ) {
      throw new SaleFinancialCoreError('A chave já foi usada com empresa, lote, comprador ou valores diferentes.');
    }
    const receipts = state.receipts.filter((row) => row.saleId === existing.id);
    const cash = state.cash.find((row) => row.saleId === existing.id && row.provider === 'SALE_CREATE');
    const contract = state.contracts.find((row) => row.saleId === existing.id && row.current);
    return {
      state,
      result: {
        saleId: String(existing.id),
        replayed: true,
        cashId: cash ? String(cash.id) : null,
        cashAmount: cash ? Number(cash.amount) : null,
        contractId: contract?.id || null,
        receipts,
      },
    };
  }

  const lotSold = state.sales.some((row) => (
    row.tenantId === tenantId
    && (row.lotId === lotId)
    && !['cancelled', 'cancelado', 'distrato', 'rescindido'].includes(String(row.status || '').toLowerCase())
  )) || (lot.saleId && state.sales.some((row) => row.id === lot.saleId));
  if (lotSold) throw new SaleFinancialCoreError('Este lote já possui venda registrada.');

  if (input.failAt) {
    throw new SaleFinancialCoreError('Falha ao gravar a venda. Nenhuma gravação financeira foi mantida.');
  }

  const saleId = `sale-${state.sales.length + 1}`;
  const next: MemoryCoreState = {
    ...state,
    sales: [...state.sales, {
      id: saleId,
      tenantId,
      lotId,
      customerId,
      projectId,
      requestKey,
      fingerprint,
      status: 'ACTIVE',
    }],
    receipts: [
      ...state.receipts,
      ...input.receipts.map((row, index) => ({
        ...row,
        id: `receipt-${state.receipts.length + index + 1}`,
        saleId,
        tenantId,
      })),
    ],
    cash: [...state.cash],
    lots: state.lots.map((row) => row.id === lotId
      ? { ...row, status: 'Vendido', saleId, customerId }
      : row),
    contracts: state.contracts,
  };
  const initial = next.receipts.find((row) => (
    row.saleId === saleId
    && Number(row.installment_number) === 0
    && ['pago', 'paid', 'paga'].includes(String(row.status || '').toLowerCase())
    && Number(row.paid_amount) > 0
  ));
  if (initial) {
    next.cash.push({
      id: `cash-${next.cash.length + 1}`,
      tenantId,
      companyId: tenantId,
      saleId,
      receiptId: initial.id,
      amount: Number(initial.paid_amount),
      provider: 'SALE_CREATE',
      status: 'ativo',
    });
  }
  return {
    state: next,
    result: {
      saleId,
      replayed: false,
      cashId: initial ? String(next.cash[next.cash.length - 1].id) : null,
      cashAmount: initial ? Number(initial.paid_amount) : null,
      contractId: null,
      receipts: next.receipts.filter((row) => row.saleId === saleId),
    },
  };
}
