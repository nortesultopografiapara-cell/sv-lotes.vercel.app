/**
 * P3 — seleção do novo titular, dados da cessão e preview A → B.
 * Somente preparação. Sem persistência. Sem execução.
 */

import { isActiveSaleStatus, isCanceledSaleStatus } from '@/lib/finance/releaseLotShared';
import { TITLE_TRANSFER_LOT_REQUIRED_STATUS } from '@/lib/finance/saleTitleTransfer';

export const TITLE_TRANSFER_SAME_TITULAR = 'TITLE_TRANSFER_SAME_TITULAR';
export const TITLE_TRANSFER_CUSTOMER_NOT_FOUND = 'TITLE_TRANSFER_CUSTOMER_NOT_FOUND';
export const TITLE_TRANSFER_CUSTOMER_CROSS_TENANT = 'TITLE_TRANSFER_CUSTOMER_CROSS_TENANT';
export const TITLE_TRANSFER_CONTRACT_CHANGED = 'TITLE_TRANSFER_CONTRACT_CHANGED';
export const TITLE_TRANSFER_SALE_NOT_ACTIVE = 'TITLE_TRANSFER_SALE_NOT_ACTIVE';
export const TITLE_TRANSFER_CUSTOMER_REQUIRED = 'TITLE_TRANSFER_CUSTOMER_REQUIRED';
export const TITLE_TRANSFER_AGIO_INVALID = 'TITLE_TRANSFER_AGIO_INVALID';
export const TITLE_TRANSFER_DATE_INVALID = 'TITLE_TRANSFER_DATE_INVALID';

export const TITLE_TRANSFER_OPEN_CHARGES_NOTICE =
  'Existem cobranças bancárias emitidas para o titular atual. O tratamento dessas cobranças será definido e homologado antes da execução da transferência.';

export const TITLE_TRANSFER_FUTURE_EXECUTION_INTRO =
  'Na futura execução da transferência:';

export const TITLE_TRANSFER_FUTURE_EXECUTION_ITEMS = [
  'a mesma venda será preservada (sale_id);',
  'o mesmo lote será preservado (block_id);',
  'lote continuará Vendido;',
  'pagamentos históricos serão preservados;',
  'saldo remanescente será assumido pelo novo titular;',
  'parcelas vigentes serão preservadas;',
  'contrato vigente será substituído por novo contrato do novo titular somente na futura fase de execução;',
  'contrato anterior permanecerá no histórico;',
  'transferência A → B será registrada em sale_title_transfers;',
  'uma futura B → C deverá criar novo elo usando previous_transfer_id.',
] as const;

export type TitleTransferPartyCard = {
  id: string;
  name: string | null;
  document: string | null;
  phone?: string | null;
  email?: string | null;
};

export type TitleTransferAssigneeSearchRow = TitleTransferPartyCard & {
  isCurrentTitular: boolean;
};

export function isTitleTransferActiveSaleStatus(status?: string | null): boolean {
  if (isCanceledSaleStatus(status)) return false;
  return isActiveSaleStatus(status);
}

export function customerBelongsToTitleTransferCompany(input: {
  companyId?: string | null;
  tenantId?: string | null;
  saleCompanyId?: string | null;
}): boolean {
  const saleCompany = String(input.saleCompanyId || '').trim();
  if (!saleCompany) return false;
  const companyId = String(input.companyId || '').trim();
  const tenantId = String(input.tenantId || '').trim();
  if (!companyId && !tenantId) return false;
  if (companyId && companyId !== saleCompany) return false;
  if (tenantId && tenantId !== saleCompany) return false;
  return true;
}

export function matchesTitleTransferCustomerSearch(
  customer: {
    name?: string | null;
    cpf_cnpj?: string | null;
    document?: string | null;
  },
  query: string,
): boolean {
  const raw = String(query || '').trim().toLowerCase();
  if (raw.length < 2) return false;
  const name = String(customer.name || '').trim().toLowerCase();
  if (name.includes(raw)) return true;
  const queryDigits = raw.replace(/\D/g, '');
  const docDigits = String(customer.cpf_cnpj || customer.document || '').replace(/\D/g, '');
  if (queryDigits.length >= 3 && docDigits.includes(queryDigits)) return true;
  return false;
}

export function assertTitleTransferNewTitular(input: {
  fromCustomerId?: string | null;
  toCustomerId?: string | null;
  customerExists?: boolean;
  customerCompanyId?: string | null;
  customerTenantId?: string | null;
  saleCompanyId?: string | null;
}): { ok: true; code: null } | { ok: false; code: string } {
  const fromId = String(input.fromCustomerId || '').trim();
  const toId = String(input.toCustomerId || '').trim();
  if (!toId) {
    return { ok: false, code: TITLE_TRANSFER_CUSTOMER_REQUIRED };
  }
  if (!input.customerExists) {
    return { ok: false, code: TITLE_TRANSFER_CUSTOMER_NOT_FOUND };
  }
  if (fromId && fromId === toId) {
    return { ok: false, code: TITLE_TRANSFER_SAME_TITULAR };
  }
  if (
    !customerBelongsToTitleTransferCompany({
      companyId: input.customerCompanyId,
      tenantId: input.customerTenantId,
      saleCompanyId: input.saleCompanyId,
    })
  ) {
    return { ok: false, code: TITLE_TRANSFER_CUSTOMER_CROSS_TENANT };
  }
  return { ok: true, code: null };
}

export function assertTitleTransferSaleStillActive(status?: string | null): {
  ok: true;
  code: null;
} | { ok: false; code: typeof TITLE_TRANSFER_SALE_NOT_ACTIVE } {
  if (!isTitleTransferActiveSaleStatus(status)) {
    return { ok: false, code: TITLE_TRANSFER_SALE_NOT_ACTIVE };
  }
  return { ok: true, code: null };
}

export function assertTitleTransferContractUnchanged(input: {
  expectedContractId?: string | null;
  currentContractId?: string | null;
}): { ok: true; code: null } | { ok: false; code: typeof TITLE_TRANSFER_CONTRACT_CHANGED } {
  const expected = String(input.expectedContractId || '').trim();
  const current = String(input.currentContractId || '').trim();
  if (expected !== current) {
    return { ok: false, code: TITLE_TRANSFER_CONTRACT_CHANGED };
  }
  return { ok: true, code: null };
}

export function parseDeclaredAgioAmount(
  raw: string | number | null | undefined,
): { ok: true; amount: number } | { ok: false; code: typeof TITLE_TRANSFER_AGIO_INVALID } {
  if (raw == null) return { ok: true, amount: 0 };
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0) {
      return { ok: false, code: TITLE_TRANSFER_AGIO_INVALID };
    }
    return { ok: true, amount: Math.round(raw * 100) / 100 };
  }
  const trimmed = String(raw).trim();
  if (!trimmed) return { ok: true, amount: 0 };
  let s = trimmed.replace(/[R$\s\u00a0]/gi, '');
  if (!s) return { ok: true, amount: 0 };
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, code: TITLE_TRANSFER_AGIO_INVALID };
  }
  return { ok: true, amount: Math.round(n * 100) / 100 };
}

export function parseTitleTransferDate(
  raw: string | null | undefined,
  fallbackIso: string,
): { ok: true; date: string } | { ok: false; code: typeof TITLE_TRANSFER_DATE_INVALID } {
  const fallback = String(fallbackIso || '').slice(0, 10);
  const value = String(raw || '').trim().slice(0, 10);
  if (!value) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(fallback)) return { ok: true, date: fallback };
    return { ok: false, code: TITLE_TRANSFER_DATE_INVALID };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { ok: false, code: TITLE_TRANSFER_DATE_INVALID };
  }
  const [year, month, day] = value.split('-').map((part) => Number(part));
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return { ok: false, code: TITLE_TRANSFER_DATE_INVALID };
  }
  return { ok: true, date: value };
}

/**
 * Ágio declarado é só documental: não abate saldo, não soma ao contrato
 * e não cria parcela/cobrança/pagamento.
 */
export function applyDocumentalAgio<T extends { remainingBalance: number; totalPaid: number }>(input: {
  finance: T;
  salePrice: number;
  declaredAgioAmount: number;
}): {
  salePrice: number;
  remainingBalance: number;
  totalPaid: number;
  declaredAgioAmount: number;
  finance: T;
} {
  return {
    salePrice: input.salePrice,
    remainingBalance: input.finance.remainingBalance,
    totalPaid: input.finance.totalPaid,
    declaredAgioAmount: input.declaredAgioAmount,
    finance: input.finance,
  };
}

export function resolveNextPreviousTransferId(
  chain: Array<{ id?: string | null }>,
): string | null {
  const last = chain[chain.length - 1];
  const id = String(last?.id || '').trim();
  return id || null;
}

export function titleTransferOpenChargesNotice(openCount: number): string | null {
  return openCount > 0 ? TITLE_TRANSFER_OPEN_CHARGES_NOTICE : null;
}

export function titleTransferLotStillSold(status?: string | null): boolean {
  return String(status || '').trim() === TITLE_TRANSFER_LOT_REQUIRED_STATUS;
}
