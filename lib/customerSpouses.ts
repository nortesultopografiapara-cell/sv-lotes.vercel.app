/**
 * Cadastro reutilizável de cônjuge por comprador + empresa.
 * Snapshot da venda permanece em sales.sale_spouse_* (imutável para contratos antigos).
 */

import {
  emptySaleSpouseFormFields,
  type SaleSpouseFormFields,
} from '@/lib/saleSpouseFields';
import {
  formatSpouseCpf,
  normalizeSpouseCpfForStorage,
  spouseCpfDigits,
} from '@/lib/saleSpouseCpf';
import { maskCpfPublic } from '@/lib/signaturePrivacy';

export type CustomerSpouseRecord = {
  id?: string;
  company_id: string;
  tenant_id?: string | null;
  customer_id: string;
  full_name: string;
  nationality?: string | null;
  marital_status?: string | null;
  profession?: string | null;
  rg?: string | null;
  rg_issuer?: string | null;
  cpf: string;
  cpf_digits: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  is_current?: boolean;
  last_used_at?: string | null;
  last_sale_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  /** Origem da sugestão na UI */
  source?: 'registry' | 'sale_history';
  source_sale_date?: string | null;
  source_sale_id?: string | null;
};

export type CustomerSpouseSuggestion = {
  key: string;
  name: string;
  cpfMasked: string;
  cpfFormatted: string;
  lastUsedLabel: string;
  source: 'registry' | 'sale_history';
  record: CustomerSpouseRecord;
};

function clean(value: unknown): string {
  if (value == null) return '';
  const text = String(value).trim();
  if (!text || text === 'undefined' || text === 'null') return '';
  return text;
}

export function saleSpouseFormHasContent(
  fields: Partial<SaleSpouseFormFields>,
): boolean {
  return Boolean(
    clean(fields.sale_spouse_name) ||
      clean(fields.sale_spouse_cpf) ||
      clean(fields.sale_spouse_rg) ||
      clean(fields.sale_spouse_phone) ||
      clean(fields.sale_spouse_email) ||
      clean(fields.sale_spouse_address) ||
      clean(fields.sale_spouse_nationality) ||
      clean(fields.sale_spouse_profession) ||
      clean(fields.sale_spouse_marital_status) ||
      clean(fields.sale_spouse_rg_issuer),
  );
}

export function customerSpouseToFormFields(
  record: CustomerSpouseRecord,
): SaleSpouseFormFields {
  return {
    has_spouse: true,
    sale_spouse_name: clean(record.full_name),
    sale_spouse_nationality: clean(record.nationality),
    sale_spouse_marital_status: clean(record.marital_status),
    sale_spouse_profession: clean(record.profession),
    sale_spouse_rg: clean(record.rg),
    sale_spouse_rg_issuer: clean(record.rg_issuer),
    sale_spouse_cpf: formatSpouseCpf(record.cpf || record.cpf_digits),
    sale_spouse_phone: clean(record.phone),
    sale_spouse_email: clean(record.email),
    sale_spouse_address: clean(record.address),
  };
}

export function formFieldsToCustomerSpousePayload(params: {
  companyId: string;
  customerId: string;
  fields: Partial<SaleSpouseFormFields>;
  lastSaleId?: string | null;
}): Omit<CustomerSpouseRecord, 'id'> | null {
  const name = clean(params.fields.sale_spouse_name);
  const cpfStored = normalizeSpouseCpfForStorage(params.fields.sale_spouse_cpf);
  const digits = spouseCpfDigits(params.fields.sale_spouse_cpf);
  if (!name || digits.length !== 11 || !cpfStored) return null;

  return {
    company_id: params.companyId,
    tenant_id: params.companyId,
    customer_id: params.customerId,
    full_name: name,
    nationality: clean(params.fields.sale_spouse_nationality) || null,
    marital_status: clean(params.fields.sale_spouse_marital_status) || null,
    profession: clean(params.fields.sale_spouse_profession) || null,
    rg: clean(params.fields.sale_spouse_rg) || null,
    rg_issuer: clean(params.fields.sale_spouse_rg_issuer) || null,
    cpf: cpfStored,
    cpf_digits: digits,
    phone: clean(params.fields.sale_spouse_phone) || null,
    email: clean(params.fields.sale_spouse_email) || null,
    address: clean(params.fields.sale_spouse_address) || null,
    is_current: true,
    last_used_at: new Date().toISOString(),
    last_sale_id: params.lastSaleId ?? null,
  };
}

export function saleRowToCustomerSpouseCandidate(
  sale: Record<string, unknown>,
  companyId: string,
  customerId: string,
): CustomerSpouseRecord | null {
  const name = clean(sale.sale_spouse_name);
  const digits = spouseCpfDigits(sale.sale_spouse_cpf as string);
  const cpfStored = normalizeSpouseCpfForStorage(sale.sale_spouse_cpf as string);
  if (!name || digits.length !== 11 || !cpfStored) return null;

  const saleDate = clean(sale.sale_date || sale.created_at).slice(0, 10) || null;

  return {
    company_id: companyId,
    tenant_id: companyId,
    customer_id: customerId,
    full_name: name,
    nationality: clean(sale.sale_spouse_nationality) || null,
    marital_status: clean(sale.sale_spouse_marital_status) || null,
    profession: clean(sale.sale_spouse_profession) || null,
    rg: clean(sale.sale_spouse_rg) || null,
    rg_issuer: clean(sale.sale_spouse_rg_issuer) || null,
    cpf: cpfStored,
    cpf_digits: digits,
    phone: clean(sale.sale_spouse_phone) || null,
    email: clean(sale.sale_spouse_email) || null,
    address: clean(sale.sale_spouse_address) || null,
    is_current: false,
    last_used_at: saleDate,
    last_sale_id: sale.id ? String(sale.id) : null,
    source: 'sale_history',
    source_sale_date: saleDate,
    source_sale_id: sale.id ? String(sale.id) : null,
  };
}

function formatLastUsedLabel(record: CustomerSpouseRecord): string {
  const date =
    clean(record.last_used_at || record.source_sale_date || record.updated_at).slice(
      0,
      10,
    ) || '';
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split('-');
    return `${d}/${m}/${y}`;
  }
  if (date) return date;
  return record.source === 'sale_history' ? 'Venda anterior' : 'Cadastro';
}

/** Mescla registry + histórico de vendas; registry tem prioridade por CPF. */
export function mergeCustomerSpouseSuggestions(params: {
  registry: CustomerSpouseRecord[];
  fromSales: CustomerSpouseRecord[];
}): CustomerSpouseSuggestion[] {
  const byCpf = new Map<string, CustomerSpouseRecord>();

  for (const row of params.fromSales) {
    const key = row.cpf_digits;
    if (!key) continue;
    const existing = byCpf.get(key);
    if (!existing) {
      byCpf.set(key, { ...row, source: 'sale_history' });
      continue;
    }
    const a = String(existing.last_used_at || existing.source_sale_date || '');
    const b = String(row.last_used_at || row.source_sale_date || '');
    if (b > a) byCpf.set(key, { ...row, source: 'sale_history' });
  }

  for (const row of params.registry) {
    const key = row.cpf_digits;
    if (!key) continue;
    byCpf.set(key, { ...row, source: 'registry' });
  }

  const list = Array.from(byCpf.values()).sort((a, b) => {
    if (a.is_current && !b.is_current) return -1;
    if (!a.is_current && b.is_current) return 1;
    const da = String(a.last_used_at || a.source_sale_date || a.updated_at || '');
    const db = String(b.last_used_at || b.source_sale_date || b.updated_at || '');
    return db.localeCompare(da);
  });

  return list.map((record) => ({
    key: `${record.source || 'registry'}:${record.cpf_digits}:${record.id || record.source_sale_id || ''}`,
    name: record.full_name,
    cpfMasked: maskCpfPublic(record.cpf || record.cpf_digits),
    cpfFormatted: formatSpouseCpf(record.cpf || record.cpf_digits),
    lastUsedLabel: formatLastUsedLabel(record),
    source: record.source === 'sale_history' ? 'sale_history' : 'registry',
    record,
  }));
}

export function applySpouseSuggestionToForm(
  suggestion: CustomerSpouseSuggestion,
): SaleSpouseFormFields {
  return customerSpouseToFormFields(suggestion.record);
}

export function clearSpouseFormFields(): SaleSpouseFormFields {
  return emptySaleSpouseFormFields();
}
