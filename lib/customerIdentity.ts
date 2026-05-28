/**
 * Busca, deduplicação e reutilização de clientes (reserva / venda).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

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
  signal_amount?: string;
  signal_date?: string;
  signal_payment_method?: string;
  signal_notes?: string;
  reservation_signal_paid?: number;
};

export function normalizeDocument(value?: string | null): string {
  return String(value || '').replace(/\D/g, '');
}

export function normalizePhone(value?: string | null): string {
  return String(value || '').replace(/\D/g, '');
}

export function customerToFormValues(customer: CustomerRecord): CustomerFormValues {
  return {
    selected_customer_id: customer.id,
    name: customer.name || '',
    cpf_cnpj: customer.cpf_cnpj || customer.document || '',
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
    zip_code: customer.zip_code || customer.cep || '',
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
    orFilters.push(`cpf_cnpj.ilike.%${digits}%`);
    orFilters.push(`document.ilike.%${digits}%`);
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
  const matches = new Map<string, CustomerRecord>();

  const doc = normalizeDocument(params.cpf_cnpj);
  const phone = normalizePhone(params.phone);
  const email = String(params.email || '').trim().toLowerCase();
  const name = String(params.name || '').trim().toUpperCase();

  const addRows = (rows: CustomerRecord[] | null) => {
    for (const row of rows || []) {
      if (row?.id) matches.set(row.id, row);
    }
  };

  if (doc.length >= 11) {
    let q = supabase
      .from('customers')
      .select('*')
      .or(`cpf_cnpj.eq.${doc},document.eq.${doc},cpf_cnpj.ilike.%${doc}%`);
    q = applyTenantScope(q, params.tenantId, params.isSuperAdmin);
    const { data } = await q;
    addRows(data as CustomerRecord[]);
  }

  if (phone.length >= 8) {
    let q = supabase.from('customers').select('*').ilike('phone', `%${phone}%`);
    q = applyTenantScope(q, params.tenantId, params.isSuperAdmin);
    const { data } = await q;
    addRows(data as CustomerRecord[]);
  }

  if (email.length >= 5) {
    let q = supabase.from('customers').select('*').ilike('email', email);
    q = applyTenantScope(q, params.tenantId, params.isSuperAdmin);
    const { data } = await q;
    addRows(data as CustomerRecord[]);
  }

  if (matches.size === 0 && name.length >= 3) {
    let q = supabase.from('customers').select('*').ilike('name', `%${name}%`).limit(5);
    q = applyTenantScope(q, params.tenantId, params.isSuperAdmin);
    const { data } = await q;
    addRows(data as CustomerRecord[]);
  }

  return Array.from(matches.values());
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

export function buildCustomerPayload(
  form: CustomerFormValues,
  ctx: { tenantId: string; projectId: string },
): Record<string, unknown> {
  const cpfRaw = form.cpf_cnpj?.trim() || null;
  const cpf = cpfRaw ? normalizeDocument(cpfRaw) || cpfRaw : null;
  const nameUpper = form.name?.trim().toUpperCase() || '';
  return {
    name: nameUpper,
    cpf_cnpj: cpf,
    document: cpf,
    phone: form.phone?.trim() || null,
    email: form.email?.trim().toUpperCase() || null,
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
    cep: form.zip_code?.trim() || null,
    zip_code: form.zip_code?.trim() || null,
    status: 'ativo',
    company_id: ctx.tenantId,
    project_id: ctx.projectId,
    tenant_id: ctx.tenantId,
  };
}

export async function resolveOrCreateCustomer(
  supabase: SupabaseClient,
  params: {
    form: CustomerFormValues;
    tenantId: string;
    projectId: string;
    isSuperAdmin: boolean;
    lotTenantId?: string | null;
  },
): Promise<{ customerId: string; reused: boolean; clientId: string | null }> {
  const { form, tenantId, projectId, isSuperAdmin, lotTenantId } = params;
  const payload = buildCustomerPayload(form, { tenantId, projectId });
  const effectiveTenantId = tenantId || lotTenantId || null;

  let customerId: string | null = form.selected_customer_id || null;
  let reused = Boolean(customerId);

  if (customerId) {
    console.log('CUSTOMER_REUSED', { customerId, source: 'selected' });
    const { error: updErr } = await supabase
      .from('customers')
      .update(payload)
      .eq('id', customerId);
    if (updErr) console.warn('CUSTOMER_UPDATE_WARN', updErr.message);
  } else {
    const existing = await findExistingCustomers(supabase, {
      tenantId: effectiveTenantId,
      isSuperAdmin,
      cpf_cnpj: form.cpf_cnpj,
      phone: form.phone,
      email: form.email,
      name: form.name,
    });

    if (existing.length === 1) {
      customerId = existing[0].id;
      reused = true;
      console.log('CUSTOMER_REUSED', { customerId });
      console.log('CUSTOMER_DUPLICATE_PREVENTED', { customerId });
      await supabase.from('customers').update(payload).eq('id', customerId);
    } else if (existing.length > 1) {
      throw new Error(
        'Mais de um cliente encontrado com os mesmos dados. Use a busca para selecionar o cliente correto.',
      );
    }
  }

  if (!customerId) {
    const { data: newCustomer, error: custError } = await supabase
      .from('customers')
      .insert([payload])
      .select('id')
      .single();

    if (custError || !newCustomer) {
      throw new Error(custError?.message || 'Não foi possível criar o cliente.');
    }
    customerId = newCustomer.id;
    reused = false;
    console.log('CUSTOMER_CREATED', { customerId });
  }

  let clientId: string | null = null;
  const cpfRaw = form.cpf_cnpj?.trim() || null;
  const cpf = cpfRaw ? normalizeDocument(cpfRaw) || cpfRaw : null;
  if (cpf) {
    let clientQ = supabase.from('clients').select('id').eq('cpf_cnpj', cpf);
    if (!isSuperAdmin && effectiveTenantId) {
      clientQ = clientQ.eq('tenant_id', effectiveTenantId);
    }
    const { data: existingClient } = await clientQ.maybeSingle();
    if (existingClient?.id) clientId = existingClient.id;
  }

  const clientPayload = {
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
  };

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
