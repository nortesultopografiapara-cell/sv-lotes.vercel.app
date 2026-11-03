/**
 * Busca, deduplicação e reutilização de clientes (reserva / venda).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logCustomerAudit } from '@/lib/customerAudit';
import { syncCustomerLegalRepresentatives } from '@/lib/customerLegalRepresentatives';
import {
  isBuyerLegalEntity,
  type BuyerRepresentativeInput,
  type BuyerSignatureMode,
} from '@/lib/buyerLegalEntity';
import {
  cepIlikePatterns,
  cpfCnpjIlikePatterns,
  formatCep,
  formatCpfCnpj,
  matchesCpfCnpj,
  normalizeCep,
  normalizeCpfCnpj,
} from '@/lib/inputMasks';

export type CustomerRecord = {
  id: string;
  name?: string | null;
  cpf_cnpj?: string | null;
  document?: string | null;
  rg?: string | null;
  rg_issuer?: string | null;
  rg_issuer_state?: string | null;
  phone?: string | null;
  email?: string | null;
  profession?: string | null;
  civil_state?: string | null;
  marital_status?: string | null;
  address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  state_uf?: string | null;
  cep?: string | null;
  zip_code?: string | null;
  tenant_id?: string | null;
  company_id?: string | null;
  project_id?: string | null;
  person_type?: string | null;
  trade_name?: string | null;
  registration_status?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
};

export type CustomerFormValues = {
  selected_customer_id: string | null;
  name: string;
  cpf_cnpj: string;
  rg: string;
  rg_issuer: string;
  rg_issuer_state: string;
  profession: string;
  civil_state: string;
  phone: string;
  email: string;
  address: string;
  neighborhood: string;
  city: string;
  state_uf: string;
  zip_code: string;
  person_type?: 'PF' | 'PJ' | null;
  trade_name?: string;
  registration_status?: string;
  address_number?: string;
  address_complement?: string;
  buyer_signature_mode?: BuyerSignatureMode;
  legal_representatives?: BuyerRepresentativeInput[];
  signal_amount?: string;
  signal_date?: string;
  signal_payment_method?: string;
  signal_notes?: string;
  reservation_signal_paid?: number;
};

export function normalizeDocument(value?: string | null): string {
  return normalizeCpfCnpj(value);
}

/** CPF/CNPJ em dígitos a partir dos campos reais de `customers` (cpf_cnpj, document). */
export function resolveCustomerDocumentDigits(
  customer: Pick<CustomerRecord, 'cpf_cnpj' | 'document'> | null | undefined,
): string {
  return normalizeDocument(customer?.cpf_cnpj || customer?.document || '');
}

export { isValidBrazilianTaxDocument } from '@/lib/inputMasks';

export function normalizePhone(value?: string | null): string {
  return String(value || '').replace(/\D/g, '');
}

export function customerToFormValues(customer: CustomerRecord): CustomerFormValues {
  return {
    selected_customer_id: customer.id,
    name: customer.name || '',
    cpf_cnpj: formatCpfCnpj(customer.cpf_cnpj || customer.document || ''),
    rg: customer.rg || '',
    rg_issuer: customer.rg_issuer || '',
    rg_issuer_state: customer.rg_issuer_state || customer.state_uf || customer.state || '',
    profession: customer.profession || '',
    civil_state: customer.civil_state || customer.marital_status || '',
    phone: customer.phone || '',
    email: customer.email || '',
    address: customer.address || '',
    neighborhood: customer.neighborhood || '',
    city: customer.city || '',
    state_uf: customer.state_uf || customer.state || '',
    zip_code: formatCep(customer.zip_code || customer.cep || ''),
    trade_name: customer.trade_name || '',
    registration_status: customer.registration_status || '',
    address_number: customer.address_number || '',
    address_complement: customer.address_complement || '',
    buyer_signature_mode: 'INDIVIDUAL',
    legal_representatives: [],
  };
}

export function emptyCustomerFormValues(): CustomerFormValues {
  return {
    selected_customer_id: null,
    name: '',
    cpf_cnpj: '',
    rg: '',
    rg_issuer: '',
    rg_issuer_state: '',
    profession: '',
    civil_state: '',
    phone: '',
    email: '',
    address: '',
    neighborhood: '',
    city: '',
    state_uf: '',
    zip_code: '',
    trade_name: '',
    registration_status: '',
    address_number: '',
    address_complement: '',
    buyer_signature_mode: 'INDIVIDUAL',
    legal_representatives: [],
    signal_amount: '',
    signal_date: '',
    signal_payment_method: '',
    signal_notes: '',
    reservation_signal_paid: 0,
  };
}

function applyTenantScope<T extends { eq: (col: string, val: string) => T }>(
  query: T,
  tenantId: string | null,
  isSuperAdmin: boolean,
): T {
  if (!isSuperAdmin && tenantId) {
    return query.eq('tenant_id', tenantId);
  }
  return query;
}

export async function searchCustomers(
  supabase: SupabaseClient,
  params: {
    query: string;
    tenantId: string | null;
    isSuperAdmin: boolean;
    limit?: number;
  },
): Promise<CustomerRecord[]> {
  const raw = params.query.trim();
  console.log('CUSTOMER_SEARCH_QUERY', { query: raw, tenantId: params.tenantId });
  if (raw.length < 2) return [];

  const limit = params.limit ?? 15;
  const digits = normalizeDocument(raw);
  const phoneDigits = normalizePhone(raw);

  const orFilters: string[] = [
    `name.ilike.%${raw}%`,
    `email.ilike.%${raw}%`,
  ];

  if (digits.length >= 3) {
    for (const pattern of cpfCnpjIlikePatterns(raw)) {
      orFilters.push(`cpf_cnpj.ilike.%${pattern}%`);
      orFilters.push(`document.ilike.%${pattern}%`);
    }
  }
  const cepDigits = normalizeCep(raw);
  if (cepDigits.length >= 2) {
    for (const pattern of cepIlikePatterns(raw)) {
      orFilters.push(`cep.ilike.%${pattern}%`);
      orFilters.push(`zip_code.ilike.%${pattern}%`);
    }
  }
  if (phoneDigits.length >= 4) {
    orFilters.push(`phone.ilike.%${phoneDigits}%`);
    orFilters.push(`phone.ilike.%${raw}%`);
  }

  let q = supabase
    .from('customers')
    .select('*')
    .or(orFilters.join(','))
    .order('name', { ascending: true })
    .limit(limit);

  q = applyTenantScope(q, params.tenantId, params.isSuperAdmin);

  const { data, error } = await q;
  if (error) {
    console.warn('CUSTOMER_SEARCH_ERROR', error.message);
    return [];
  }

  const results = (data || []) as CustomerRecord[];
  console.log('CUSTOMER_SEARCH_QUERY', { count: results.length });
  return results;
}

/** ID selecionado no formulário de venda/reserva (`selected_customer_id` ou `customer_id`). */
export function getFormSelectedCustomerId(
  form: Partial<CustomerFormValues> & { customer_id?: string | null },
): string | null {
  const raw = form.selected_customer_id ?? form.customer_id ?? null;
  const trimmed = String(raw || '').trim();
  return trimmed || null;
}

export type SaleCustomerResolveDecision =
  | { action: 'use_selected'; customerId: string }
  | { action: 'lookup_cpf'; normalizedCpf: string }
  | {
      action: 'reject';
      reason: 'no_customer_no_cpf' | 'cpf_too_short';
      message: string;
    };

/** Estratégia de resolução do cliente na venda — sem consulta ao banco. */
export function resolveSaleCustomerDecision(
  form: Partial<CustomerFormValues> & { customer_id?: string | null },
): SaleCustomerResolveDecision {
  const selectedId = getFormSelectedCustomerId(form);
  if (selectedId) {
    return { action: 'use_selected', customerId: selectedId };
  }

  const normalizedCpf = normalizeDocument(form.cpf_cnpj);
  if (!normalizedCpf) {
    return {
      action: 'reject',
      reason: 'no_customer_no_cpf',
      message:
        'Selecione um cliente na busca ou informe o CPF/CNPJ para continuar a venda.',
    };
  }

  if (normalizedCpf.length < 11) {
    return {
      action: 'reject',
      reason: 'cpf_too_short',
      message:
        'CPF/CNPJ incompleto. Selecione o cliente na busca ou informe o documento completo.',
    };
  }

  return { action: 'lookup_cpf', normalizedCpf };
}

export function buildDuplicateCustomerError(
  normalizedCpf: string,
  customers: Array<Pick<CustomerRecord, 'id'>>,
): string {
  const ids = customers.map((c) => c.id).filter(Boolean);
  const docLabel = formatCpfCnpj(normalizedCpf) || normalizedCpf;
  return (
    `Mais de um cliente encontrado com o CPF/CNPJ ${docLabel} ` +
    `(${ids.length} registros: ${ids.join(', ')}). ` +
    'Use a busca para selecionar o cliente correto.'
  );
}

export async function findExistingCustomersByCpfCnpj(
  supabase: SupabaseClient,
  params: {
    tenantId: string | null;
    isSuperAdmin: boolean;
    cpf_cnpj?: string | null;
  },
): Promise<CustomerRecord[]> {
  const doc = normalizeDocument(params.cpf_cnpj);
  if (doc.length < 11) return [];

  const patterns = cpfCnpjIlikePatterns(doc);
  const orParts = patterns.flatMap((p) => [
    `cpf_cnpj.ilike.%${p}%`,
    `document.ilike.%${p}%`,
  ]);
  let q = supabase.from('customers').select('*').or(orParts.join(','));
  q = applyTenantScope(q, params.tenantId, params.isSuperAdmin);
  const { data } = await q;
  return ((data as CustomerRecord[] | null) ?? []).filter(
    (row) =>
      matchesCpfCnpj(doc, row.cpf_cnpj) || matchesCpfCnpj(doc, row.document),
  );
}

/** @deprecated Use findExistingCustomersByCpfCnpj — mantido para compatibilidade. */
export async function findExistingCustomers(
  supabase: SupabaseClient,
  params: {
    tenantId: string | null;
    isSuperAdmin: boolean;
    cpf_cnpj?: string | null;
    phone?: string | null;
    email?: string | null;
    name?: string | null;
  },
): Promise<CustomerRecord[]> {
  return findExistingCustomersByCpfCnpj(supabase, {
    tenantId: params.tenantId,
    isSuperAdmin: params.isSuperAdmin,
    cpf_cnpj: params.cpf_cnpj,
  });
}

export async function loadCustomerById(
  supabase: SupabaseClient,
  customerId: string,
): Promise<CustomerRecord | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .maybeSingle();

  if (error || !data) return null;
  return data as CustomerRecord;
}

const CUSTOMER_EMPTY_TOKENS = new Set([
  '',
  '-',
  '—',
  'n/a',
  'na',
  'undefined',
  'null',
  'não informado',
  'nao informado',
  'não informada',
  'nao informada',
  'profissão não informada',
  'profissao nao informada',
  'estado civil não informado',
  'estado civil nao informado',
  'bairro não informado',
  'bairro nao informado',
  'cidade não informada',
  'cidade nao informada',
  'cep não informado',
  'cep nao informado',
  'cliente não informado',
  'cpf/cnpj não informado',
]);

/** E-mail opcional no formulário: vazio limpa no banco (null). */
export function customerEmailFromForm(email?: string | null): string | null {
  const trimmed = String(email ?? '').trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase();
}

/** Campo vazio, placeholder ou "Não informado" — não deve sobrescrever dado existente. */
export function isEmptyCustomerField(value: unknown): boolean {
  if (value == null) return true;
  const text = String(value).trim();
  if (!text) return true;
  return CUSTOMER_EMPTY_TOKENS.has(text.toLowerCase());
}

/** Primeiro valor não vazio entre candidatos (ordem = prioridade). */
export function pickNonemptyCustomerField(...values: unknown[]): string {
  for (const value of values) {
    if (isEmptyCustomerField(value)) continue;
    return String(value).trim();
  }
  return '';
}

/**
 * Mescla camadas sem apagar valores preenchidos.
 * Camadas anteriores no array têm maior prioridade (ex.: customers → sale → contract).
 */
export function mergeCustomerData(
  ...layers: Array<Record<string, unknown> | null | undefined>
): Record<string, unknown> {
  const sources = layers.filter(
    (layer): layer is Record<string, unknown> =>
      layer != null && typeof layer === 'object',
  );
  if (!sources.length) return {};

  const merged: Record<string, unknown> = {};
  for (const layer of sources) {
    if (layer.id != null && merged.id == null) merged.id = layer.id;
  }

  const pick = (...keys: string[]) => {
    const values: unknown[] = [];
    for (const layer of sources) {
      for (const key of keys) values.push(layer[key]);
    }
    return pickNonemptyCustomerField(...values);
  };

  const name = pick('name', 'full_name');
  if (name) merged.name = name;

  const document = pick('document', 'cpf_cnpj', 'cpf');
  if (document) {
    merged.document = document;
    merged.cpf_cnpj = document;
    merged.cpf = document;
  }

  const rg = pick('rg', 'rg_number', 'document_rg');
  if (rg) merged.rg = rg;

  const rgIssuer = pick('rg_issuer', 'issuing_authority', 'orgao_emissor');
  if (rgIssuer) merged.rg_issuer = rgIssuer;

  const rgIssuerState = pick(
    'rg_issuer_state',
    'issuing_state',
    'uf_emissor',
  );
  if (rgIssuerState) merged.rg_issuer_state = rgIssuerState.toUpperCase();

  const profession = pick('profession');
  if (profession) merged.profession = profession;

  const civilState = pick('civil_state', 'marital_status');
  if (civilState) {
    merged.civil_state = civilState;
    merged.marital_status = civilState;
  }

  const phone = pick('phone');
  if (phone) merged.phone = phone;

  const email = pick('email');
  if (email) merged.email = email;

  const address = pick('address', 'street');
  if (address) merged.address = address;

  const neighborhood = pick('neighborhood');
  if (neighborhood) merged.neighborhood = neighborhood;

  const city = pick('city');
  if (city) merged.city = city;

  const stateUf = pick('state_uf', 'state');
  if (stateUf) {
    merged.state_uf = stateUf.toUpperCase();
    merged.state = stateUf.toUpperCase();
  }

  const zip = pick('zip_code', 'cep');
  if (zip) {
    merged.zip_code = zip;
    merged.cep = zip;
  }

  for (const layer of sources) {
    for (const [key, value] of Object.entries(layer)) {
      if (key in merged) continue;
      if (!isEmptyCustomerField(value)) merged[key] = value;
    }
  }

  return merged;
}

/** Atualização parcial: incoming só substitui quando o novo valor é preenchido. */
export function mergePreservingCustomerFields(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const base =
    existing && typeof existing === 'object' ? { ...existing } : {};
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    if (!isEmptyCustomerField(value)) {
      out[key] = value;
    }
  }
  return out;
}

/** Campos de cliente a partir do formulário de venda/reserva. */
export function customerPatchFromForm(
  form: Partial<CustomerFormValues> & { name?: string },
): Record<string, unknown> {
  const cpfRaw = form.cpf_cnpj?.trim() || null;
  const cpf = cpfRaw ? formatCpfCnpj(cpfRaw) || cpfRaw : null;
  const patch: Record<string, unknown> = {};

  if (!isEmptyCustomerField(form.name)) {
    patch.name = String(form.name).trim().toUpperCase();
  }
  if (cpf) {
    patch.cpf_cnpj = cpf;
    patch.document = cpf;
  }
  if (!isEmptyCustomerField(form.phone)) patch.phone = form.phone?.trim() || null;
  patch.email = customerEmailFromForm(form.email);
  if (!isEmptyCustomerField(form.rg)) patch.rg = form.rg?.trim() || null;
  if (!isEmptyCustomerField(form.rg_issuer)) {
    patch.rg_issuer = form.rg_issuer?.trim() || null;
  }
  if (!isEmptyCustomerField(form.rg_issuer_state)) {
    patch.rg_issuer_state = form.rg_issuer_state?.trim().toUpperCase() || null;
  }
  if (!isEmptyCustomerField(form.profession)) {
    patch.profession = form.profession?.trim() || null;
  }
  if (!isEmptyCustomerField(form.civil_state)) {
    const civil = form.civil_state?.trim() || null;
    patch.civil_state = civil;
    patch.marital_status = civil;
  }
  if (!isEmptyCustomerField(form.address)) {
    patch.address = form.address?.trim().toUpperCase() || null;
  }
  if (!isEmptyCustomerField(form.neighborhood)) {
    patch.neighborhood = form.neighborhood?.trim().toUpperCase() || null;
  }
  if (!isEmptyCustomerField(form.city)) {
    patch.city = form.city?.trim().toUpperCase() || null;
  }
  if (!isEmptyCustomerField(form.state_uf)) {
    const uf = form.state_uf?.trim().toUpperCase() || null;
    patch.state = uf;
    patch.state_uf = uf;
  }
  if (!isEmptyCustomerField(form.zip_code)) {
    const zip = form.zip_code?.trim() ? formatCep(form.zip_code.trim()) : null;
    patch.cep = zip;
    patch.zip_code = zip;
  }

  const pj = isBuyerLegalEntity(form.cpf_cnpj);
  patch.person_type = pj ? 'PJ' : normalizeDocument(form.cpf_cnpj).length === 11 ? 'PF' : null;
  if (pj) {
    if (!isEmptyCustomerField(form.trade_name)) patch.trade_name = form.trade_name?.trim() || null;
    if (!isEmptyCustomerField(form.registration_status)) {
      patch.registration_status = form.registration_status?.trim() || null;
    }
    if (!isEmptyCustomerField(form.address_number)) {
      patch.address_number = form.address_number?.trim() || null;
    }
    if (!isEmptyCustomerField(form.address_complement)) {
      patch.address_complement = form.address_complement?.trim() || null;
    }
    patch.legal_representatives_json = form.legal_representatives || [];
    patch.buyer_signature_mode = form.buyer_signature_mode || 'INDIVIDUAL';
  }

  return patch;
}

/** Mescla patch do formulário preservando campos preenchidos, exceto e-mail (pode limpar). */
export function mergeCustomerPatchFromForm(
  existing: Record<string, unknown> | null | undefined,
  form: Partial<CustomerFormValues> & { name?: string },
): Record<string, unknown> {
  const patch = customerPatchFromForm(form);
  const merged = mergePreservingCustomerFields(existing, patch);
  merged.email = customerEmailFromForm(form.email);
  return merged;
}

export function buildCustomerPayload(
  form: CustomerFormValues,
  ctx: { tenantId: string; projectId: string },
  existing?: Record<string, unknown> | null,
): Record<string, unknown> {
  const cpfRaw = form.cpf_cnpj?.trim() || null;
  const cpf = cpfRaw ? formatCpfCnpj(cpfRaw) || cpfRaw : null;
  const zipFormatted = form.zip_code?.trim() ? formatCep(form.zip_code.trim()) : null;
  const nameUpper = form.name?.trim().toUpperCase() || '';
  const fromForm = {
    name: nameUpper,
    cpf_cnpj: cpf,
    document: cpf,
    phone: form.phone?.trim() || null,
    email: customerEmailFromForm(form.email),
    rg: form.rg?.trim() || null,
    rg_issuer: form.rg_issuer?.trim() || null,
    rg_issuer_state: form.rg_issuer_state?.trim().toUpperCase() || null,
    profession: form.profession?.trim() || null,
    marital_status: form.civil_state?.trim() || null,
    civil_state: form.civil_state?.trim() || null,
    address: form.address?.trim().toUpperCase() || null,
    neighborhood: form.neighborhood?.trim().toUpperCase() || null,
    city: form.city?.trim().toUpperCase() || null,
    state: form.state_uf?.trim().toUpperCase() || null,
    state_uf: form.state_uf?.trim().toUpperCase() || null,
    cep: zipFormatted,
    zip_code: zipFormatted,
    person_type: isBuyerLegalEntity(form.cpf_cnpj) ? 'PJ' : 'PF',
    trade_name: form.trade_name?.trim() || null,
    registration_status: form.registration_status?.trim() || null,
    address_number: form.address_number?.trim() || null,
    address_complement: form.address_complement?.trim() || null,
    legal_representatives_json: form.legal_representatives || [],
    buyer_signature_mode: form.buyer_signature_mode || null,
    status: 'ativo',
    company_id: ctx.tenantId,
    project_id: ctx.projectId,
    tenant_id: ctx.tenantId,
  };

  if (existing) {
    return mergeCustomerPatchFromForm(existing, form);
  }
  return fromForm;
}

async function writeCustomerRow(
  run: (payload: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>,
  payload: Record<string, unknown>,
): Promise<{ error: { message?: string } | null }> {
  let current = { ...payload };
  let last: { message?: string } | null = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const result = await run(current);
    if (!result.error) return { error: null };
    last = result.error;
    const missing = String(result.error.message || '').match(
      /Could not find the '(\w+)' column|column ["']?(\w+)["']? of relation/i,
    );
    const column = missing?.[1] || missing?.[2];
    if (!column || !(column in current)) break;
    const next = { ...current };
    delete next[column];
    current = next;
  }
  return { error: last };
}

export async function resolveOrCreateCustomer(
  supabase: SupabaseClient,
  params: {
    form: CustomerFormValues;
    tenantId: string;
    projectId: string;
    isSuperAdmin: boolean;
    lotTenantId?: string | null;
    changedBy?: string | null;
  },
): Promise<{ customerId: string; reused: boolean; clientId: string | null }> {
  const { form, tenantId, projectId, isSuperAdmin, lotTenantId, changedBy } =
    params;
  const effectiveTenantId = tenantId || lotTenantId || null;

  const decision = resolveSaleCustomerDecision(form);
  const receivedCustomerId = getFormSelectedCustomerId(form);
  const receivedCpf = normalizeDocument(form.cpf_cnpj);

  console.log('CUSTOMER_RESOLVE_START', {
    customer_id: receivedCustomerId,
    cpf_cnpj: receivedCpf || null,
    decision: decision.action,
  });

  if (decision.action === 'reject') {
    console.warn('CUSTOMER_RESOLVE_REJECTED', {
      reason: decision.reason,
      customer_id: receivedCustomerId,
      cpf_cnpj: receivedCpf || null,
    });
    throw new Error(decision.message);
  }

  let customerId: string | null = null;
  let reused = false;
  let existingRecord: Record<string, unknown> | null = null;

  if (decision.action === 'use_selected') {
    customerId = decision.customerId;
    reused = true;
    existingRecord = (await loadCustomerById(supabase, customerId)) as Record<
      string,
      unknown
    > | null;
    if (!existingRecord) {
      throw new Error(
        `Cliente selecionado não encontrado (ID: ${customerId}). Selecione novamente na busca.`,
      );
    }
    console.log('CUSTOMER_RESOLVE_SELECTED', {
      customer_id: customerId,
      match_count: 1,
      customer_ids: [customerId],
    });
  } else {
    const existing = await findExistingCustomersByCpfCnpj(supabase, {
      tenantId: effectiveTenantId,
      isSuperAdmin,
      cpf_cnpj: decision.normalizedCpf,
    });

    console.log('CUSTOMER_RESOLVE_CPF_LOOKUP', {
      customer_id: receivedCustomerId,
      cpf_cnpj: decision.normalizedCpf,
      match_count: existing.length,
      customer_ids: existing.map((row) => row.id),
    });

    if (existing.length === 1) {
      customerId = existing[0].id;
      reused = true;
      existingRecord = existing[0] as Record<string, unknown>;
      console.log('CUSTOMER_REUSED', { customerId, source: 'cpf_cnpj' });
      console.log('CUSTOMER_DUPLICATE_PREVENTED', { customerId });
    } else if (existing.length > 1) {
      const conflictFields = ['cpf_cnpj'];
      console.warn('CUSTOMER_RESOLVE_DUPLICATE_CPF', {
        cpf_cnpj: decision.normalizedCpf,
        match_count: existing.length,
        customer_ids: existing.map((row) => row.id),
        conflict_fields: conflictFields,
      });
      throw new Error(buildDuplicateCustomerError(decision.normalizedCpf, existing));
    }
  }

  const payload = buildCustomerPayload(
    form,
    { tenantId, projectId },
    existingRecord,
  );

  if (customerId) {
    if (decision.action === 'use_selected') {
      console.log('CUSTOMER_REUSED', { customerId, source: 'selected' });
    }
    if (existingRecord) {
      await logCustomerAudit(supabase, {
        customerId,
        oldData: existingRecord,
        newData: { ...existingRecord, ...payload },
        changedBy,
        source: 'sale_create',
      });
    }
    const { error: updErr } = await writeCustomerRow(
      async (row) => {
        const res = await supabase.from('customers').update(row).eq('id', customerId);
        return { error: res.error };
      },
      payload,
    );
    if (updErr) console.warn('CUSTOMER_UPDATE_WARN', updErr.message);
  }

  if (!customerId) {
    let insertPayload = payload;
    let newCustomer: { id: string } | null = null;
    let custError: { message?: string } | null = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const inserted = await supabase
        .from('customers')
        .insert([insertPayload])
        .select('id')
        .single();
      if (!inserted.error && inserted.data) {
        newCustomer = inserted.data;
        custError = null;
        break;
      }
      custError = inserted.error;
      const missing = String(inserted.error?.message || '').match(
        /Could not find the '(\w+)' column|column ["']?(\w+)["']? of relation/i,
      );
      const column = missing?.[1] || missing?.[2];
      if (!column || !(column in insertPayload)) break;
      const next = { ...insertPayload };
      delete next[column];
      insertPayload = next;
    }

    if (custError || !newCustomer) {
      throw new Error(custError?.message || 'Não foi possível criar o cliente.');
    }
    customerId = newCustomer.id;
    reused = false;
    console.log('CUSTOMER_CREATED', { customerId });
  }

  if (customerId && isBuyerLegalEntity({ cpf_cnpj: form.cpf_cnpj, person_type: form.person_type })) {
    await syncCustomerLegalRepresentatives(supabase, {
      companyId: effectiveTenantId,
      customerId,
      representatives: form.legal_representatives || [],
    });
  }

  let clientId: string | null = null;
  const cpfRaw = form.cpf_cnpj?.trim() || null;
  const cpf = cpfRaw ? formatCpfCnpj(cpfRaw) || cpfRaw : null;
  if (cpf) {
    const docDigits = normalizeCpfCnpj(cpf);
    const patterns = cpfCnpjIlikePatterns(cpf);
    const orParts = patterns.flatMap((p) => [`cpf_cnpj.ilike.%${p}%`]);
    let clientQ = supabase.from('clients').select('id, cpf_cnpj').or(orParts.join(','));
    if (!isSuperAdmin && effectiveTenantId) {
      clientQ = clientQ.eq('tenant_id', effectiveTenantId);
    }
    const { data: clientRows } = await clientQ.limit(5);
    const existingClient = (clientRows || []).find((row) =>
      matchesCpfCnpj(docDigits, row.cpf_cnpj),
    );
    if (existingClient?.id) clientId = existingClient.id;
  }

  let existingClient: Record<string, unknown> | null = null;
  if (clientId) {
    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .maybeSingle();
    existingClient = (data as Record<string, unknown>) || null;
  }

  const clientPayload = mergePreservingCustomerFields(existingClient, {
    tenant_id: effectiveTenantId,
    full_name: payload.name,
    cpf_cnpj: cpf,
    phone: payload.phone,
    email: payload.email,
    rg: payload.rg,
    profession: payload.profession,
    civil_state: payload.civil_state,
    address: payload.address,
    neighborhood: payload.neighborhood,
    city: payload.city,
    state_uf: payload.state_uf,
    zip_code: payload.zip_code,
  });
  clientPayload.email = payload.email;

  if (!clientId) {
    const { data: newClient } = await supabase
      .from('clients')
      .insert([clientPayload])
      .select('id')
      .single();
    if (newClient?.id) clientId = newClient.id;
  } else {
    await supabase.from('clients').update(clientPayload).eq('id', clientId);
  }

  return { customerId, reused, clientId };
}
