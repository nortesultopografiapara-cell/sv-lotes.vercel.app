import type { SupabaseClient } from '@supabase/supabase-js';
import { createTopographyProject } from './projectsService';
import type { MasterTopographyProjectInput } from './types';
import { topographyServiceTypeLabel } from './serviceTypes';
import {
  TOPOGRAPHY_QUOTE_ACTIVE_STATUS_CODES,
  type TopographyQuoteStatusCode,
} from './quoteStatuses';
import type {
  MasterTopographyQuote,
  MasterTopographyQuoteInput,
  MasterTopographyQuoteKpis,
  MasterTopographyQuoteListFilters,
  MasterTopographyQuoteListResult,
} from './quoteTypes';
import { canPermanentlyDeleteTopographyQuote } from './quoteDeletePolicy';

export { canPermanentlyDeleteTopographyQuote } from './quoteDeletePolicy';

export const QUOTE_SELECT_COLUMNS = `
  id, code, title, client_name, contact_name, phone, email,
  city, state, address, distance_km, category, service_type, description, status,
  proposal_date, expiration_date, estimated_deadline,
  estimated_value, discount_value, discount_percent, bdi_percent, margin_percent, final_value,
  payment_method, payment_terms, internal_manager, internal_notes, technical_notes,
  approved_at, approved_by, converted_project_id,
  is_archived, created_by, created_at, updated_at
`.replace(/\s+/g, ' ').trim();

const SELECT_COLUMNS = QUOTE_SELECT_COLUMNS;

export function parseQuoteRow(row: Record<string, unknown>): MasterTopographyQuote {
  return {
    id: String(row.id),
    code: String(row.code || ''),
    title: row.title ? String(row.title) : null,
    client_name: String(row.client_name || ''),
    contact_name: row.contact_name ? String(row.contact_name) : null,
    phone: row.phone ? String(row.phone) : null,
    email: row.email ? String(row.email) : null,
    city: row.city ? String(row.city) : null,
    state: row.state ? String(row.state) : null,
    address: row.address ? String(row.address) : null,
    distance_km: row.distance_km == null ? null : Number(row.distance_km),
    category: row.category as MasterTopographyQuote['category'],
    service_type: row.service_type as MasterTopographyQuote['service_type'],
    description: row.description ? String(row.description) : null,
    status: row.status as MasterTopographyQuote['status'],
    proposal_date: row.proposal_date ? String(row.proposal_date).slice(0, 10) : null,
    expiration_date: row.expiration_date ? String(row.expiration_date).slice(0, 10) : null,
    estimated_deadline: row.estimated_deadline ? String(row.estimated_deadline) : null,
    estimated_value: row.estimated_value == null ? null : Number(row.estimated_value),
    discount_value: Number(row.discount_value || 0),
    discount_percent: Number(row.discount_percent || 0),
    bdi_percent: Number(row.bdi_percent || 0),
    margin_percent: Number(row.margin_percent || 0),
    final_value: row.final_value == null ? null : Number(row.final_value),
    payment_method: row.payment_method ? String(row.payment_method) : null,
    payment_terms: row.payment_terms ? String(row.payment_terms) : null,
    internal_manager: row.internal_manager ? String(row.internal_manager) : null,
    internal_notes: row.internal_notes ? String(row.internal_notes) : null,
    technical_notes: row.technical_notes ? String(row.technical_notes) : null,
    approved_at: row.approved_at ? String(row.approved_at) : null,
    approved_by: row.approved_by ? String(row.approved_by) : null,
    converted_project_id: row.converted_project_id ? String(row.converted_project_id) : null,
    is_archived: Boolean(row.is_archived),
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  };
}

function parseRow(row: Record<string, unknown>): MasterTopographyQuote {
  return parseQuoteRow(row);
}

function inputToRow(input: MasterTopographyQuoteInput) {
  return {
    client_name: input.client_name,
    title: input.title ?? null,
    contact_name: input.contact_name ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    city: input.city ?? null,
    state: input.state ?? null,
    address: input.address ?? null,
    distance_km: input.distance_km ?? null,
    category: input.category,
    service_type: input.service_type,
    description: input.description ?? null,
    status: input.status,
    proposal_date: input.proposal_date ?? null,
    expiration_date: input.expiration_date ?? null,
    estimated_deadline: input.estimated_deadline ?? null,
    estimated_value: input.estimated_value ?? null,
    discount_value: input.discount_value ?? 0,
    discount_percent: input.discount_percent ?? 0,
    bdi_percent: input.bdi_percent ?? 0,
    margin_percent: input.margin_percent ?? 0,
    final_value: input.final_value ?? null,
    payment_method: input.payment_method ?? null,
    payment_terms: input.payment_terms ?? null,
    internal_manager: input.internal_manager ?? null,
    internal_notes: input.internal_notes ?? null,
    technical_notes: input.technical_notes ?? null,
  };
}

function emptyKpis(): MasterTopographyQuoteKpis {
  return {
    active: 0,
    inNegotiation: 0,
    approved: 0,
    refused: 0,
    totalQuotedValue: 0,
    totalApprovedValue: 0,
    approvalRate: 0,
  };
}

function applyListFilters(
  query: {
    eq: (col: string, val: unknown) => typeof query;
    ilike: (col: string, val: string) => typeof query;
    gte: (col: string, val: string) => typeof query;
    lte: (col: string, val: string) => typeof query;
    or: (expr: string) => typeof query;
  },
  filters: MasterTopographyQuoteListFilters,
) {
  if (!filters.includeArchived) query = query.eq('is_archived', false);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.category) query = query.eq('category', filters.category);
  if (filters.serviceType) query = query.eq('service_type', filters.serviceType);
  if (filters.city) query = query.ilike('city', `%${filters.city}%`);
  if (filters.manager) query = query.ilike('internal_manager', `%${filters.manager}%`);
  if (filters.fromDate) query = query.gte('created_at', `${filters.fromDate}T00:00:00.000Z`);
  if (filters.toDate) query = query.lte('created_at', `${filters.toDate}T23:59:59.999Z`);
  const q = String(filters.q || '').trim();
  if (q) {
    const escaped = q.replace(/[%_]/g, '');
    query = query.or(
      `code.ilike.%${escaped}%,client_name.ilike.%${escaped}%,contact_name.ilike.%${escaped}%`,
    );
  }
  return query;
}

export async function generateTopographyQuoteCode(
  supabase: SupabaseClient,
  year = new Date().getFullYear(),
): Promise<string> {
  const { data, error } = await supabase.rpc('generate_next_topography_quote_code', {
    p_year: year,
  });
  if (error) throw new Error(error.message || 'Falha ao gerar código do orçamento.');
  const code = String(data || '').trim();
  if (!/^ORC-\d{4}-\d{4}$/.test(code)) {
    throw new Error('Código de orçamento inválido retornado pelo servidor.');
  }
  return code;
}

export async function computeTopographyQuoteKpis(
  supabase: SupabaseClient,
  filters: MasterTopographyQuoteListFilters = {},
): Promise<MasterTopographyQuoteKpis> {
  let query = supabase
    .from('master_topography_quotes')
    .select('status, estimated_value, final_value, is_archived');
  query = applyListFilters(query, filters);
  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Falha ao calcular KPIs de orçamentos.');

  const kpis = emptyKpis();
  let decided = 0;
  let approvedCount = 0;

  for (const row of (data || []) as Array<{
    status: string;
    estimated_value: number | null;
    final_value: number | null;
    is_archived: boolean;
  }>) {
    const value = Number(row.final_value ?? row.estimated_value ?? 0);
    kpis.totalQuotedValue += value;

    if (row.is_archived) continue;
    const status = String(row.status || '');
    if (TOPOGRAPHY_QUOTE_ACTIVE_STATUS_CODES.includes(status as TopographyQuoteStatusCode)) {
      kpis.active += 1;
    }
    if (status === 'EM_NEGOCIACAO') kpis.inNegotiation += 1;
    if (status === 'APROVADO' || status === 'CONVERTIDO') {
      kpis.approved += 1;
      kpis.totalApprovedValue += value;
      approvedCount += 1;
      decided += 1;
    }
    if (status === 'RECUSADO') {
      kpis.refused += 1;
      decided += 1;
    }
  }

  kpis.totalQuotedValue = Math.round(kpis.totalQuotedValue * 100) / 100;
  kpis.totalApprovedValue = Math.round(kpis.totalApprovedValue * 100) / 100;
  kpis.approvalRate =
    decided <= 0 ? 0 : Math.round((approvedCount / decided) * 10000) / 100;

  return kpis;
}

export async function listTopographyQuotes(
  supabase: SupabaseClient,
  filters: MasterTopographyQuoteListFilters = {},
): Promise<MasterTopographyQuoteListResult> {
  const page = Math.max(1, Math.trunc(filters.page || 1));
  const limit = Math.min(100, Math.max(1, Math.trunc(filters.limit || 20)));
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const sort = filters.sort || 'created_at';
  const ascending = (filters.order || 'desc') === 'asc';

  let query = supabase
    .from('master_topography_quotes')
    .select(SELECT_COLUMNS, { count: 'exact' });
  query = applyListFilters(query, filters);
  query = query.order(sort, { ascending }).range(from, to);

  const [{ data, error, count }, kpis] = await Promise.all([
    query,
    computeTopographyQuoteKpis(supabase, filters),
  ]);
  if (error) throw new Error(error.message || 'Falha ao listar orçamentos.');

  return {
    quotes: (data || []).map((row) => parseRow(row as Record<string, unknown>)),
    total: count ?? 0,
    page,
    limit,
    kpis,
  };
}

export async function getTopographyQuoteById(
  supabase: SupabaseClient,
  id: string,
): Promise<MasterTopographyQuote | null> {
  const { data, error } = await supabase
    .from('master_topography_quotes')
    .select(SELECT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message || 'Falha ao carregar orçamento.');
  if (!data) return null;
  return parseRow(data as Record<string, unknown>);
}

export async function createTopographyQuote(
  supabase: SupabaseClient,
  input: MasterTopographyQuoteInput,
  createdBy: string | null,
): Promise<MasterTopographyQuote> {
  const code = await generateTopographyQuoteCode(supabase);
  const payload = {
    ...inputToRow(input),
    code,
    created_by: createdBy,
    updated_at: new Date().toISOString(),
    approved_at: input.status === 'APROVADO' ? new Date().toISOString() : null,
    approved_by: input.status === 'APROVADO' ? createdBy : null,
  };

  const { data, error } = await supabase
    .from('master_topography_quotes')
    .insert(payload)
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw new Error(error.message || 'Falha ao criar orçamento.');
  // Orçamento em branco: sem etapas/itens automáticos (Fase correção cirúrgica).
  return parseRow(data as Record<string, unknown>);
}

export async function updateTopographyQuote(
  supabase: SupabaseClient,
  id: string,
  input: MasterTopographyQuoteInput,
  userId: string | null,
): Promise<MasterTopographyQuote> {
  const existing = await getTopographyQuoteById(supabase, id);
  if (!existing) throw new Error('Orçamento não encontrado.');
  if (existing.status === 'CONVERTIDO' || existing.converted_project_id) {
    throw new Error('Orçamento já convertido não pode ser editado.');
  }

  const payload: Record<string, unknown> = {
    ...inputToRow(input),
    updated_at: new Date().toISOString(),
  };
  if (input.status === 'APROVADO' && existing.status !== 'APROVADO') {
    payload.approved_at = new Date().toISOString();
    payload.approved_by = userId;
  }

  const { data, error } = await supabase
    .from('master_topography_quotes')
    .update(payload)
    .eq('id', id)
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw new Error(error.message || 'Falha ao atualizar orçamento.');
  return parseRow(data as Record<string, unknown>);
}

export async function patchTopographyQuoteFields(
  supabase: SupabaseClient,
  id: string,
  fields: Record<string, unknown>,
): Promise<MasterTopographyQuote> {
  const { data, error } = await supabase
    .from('master_topography_quotes')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw new Error(error.message || 'Falha ao atualizar orçamento.');
  return parseRow(data as Record<string, unknown>);
}

export async function archiveTopographyQuote(supabase: SupabaseClient, id: string) {
  return patchTopographyQuoteFields(supabase, id, { is_archived: true });
}

export async function restoreTopographyQuote(supabase: SupabaseClient, id: string) {
  return patchTopographyQuoteFields(supabase, id, { is_archived: false });
}

/**
 * Remove o orçamento. Filhos (etapas, itens, preços, histórico) seguem ON DELETE CASCADE.
 */
export async function deleteTopographyQuotePermanently(
  supabase: SupabaseClient,
  id: string,
  confirmationCode: string,
): Promise<{ id: string; code: string }> {
  const existing = await getTopographyQuoteById(supabase, id);
  if (!existing) throw new Error('Orçamento não encontrado.');

  const gate = canPermanentlyDeleteTopographyQuote(existing);
  if (!gate.ok) throw new Error(gate.reason);

  const expected = existing.code.trim();
  const typed = String(confirmationCode || '').trim();
  if (!typed || typed !== expected) {
    throw new Error('Código do orçamento não confere. Digite o código exatamente para confirmar.');
  }

  const { error } = await supabase.from('master_topography_quotes').delete().eq('id', id);
  if (error) throw new Error(error.message || 'Falha ao excluir orçamento.');

  return { id: existing.id, code: existing.code };
}

export async function duplicateTopographyQuote(
  supabase: SupabaseClient,
  id: string,
  createdBy: string | null,
): Promise<MasterTopographyQuote> {
  const source = await getTopographyQuoteById(supabase, id);
  if (!source) throw new Error('Orçamento não encontrado.');

  const code = await generateTopographyQuoteCode(supabase);
  const payload = {
    ...inputToRow({
      client_name: source.client_name,
      title: source.title ? `${source.title} (cópia)` : `Cópia de ${source.code}`,
      contact_name: source.contact_name,
      phone: source.phone,
      email: source.email,
      city: source.city,
      state: source.state,
      address: source.address,
      distance_km: source.distance_km,
      category: source.category,
      service_type: source.service_type,
      description: source.description,
      status: 'RASCUNHO',
      proposal_date: source.proposal_date,
      expiration_date: source.expiration_date,
      estimated_deadline: source.estimated_deadline,
      estimated_value: source.estimated_value,
      discount_value: source.discount_value,
      discount_percent: source.discount_percent,
      bdi_percent: source.bdi_percent,
      margin_percent: source.margin_percent,
      final_value: source.final_value,
      payment_method: source.payment_method,
      payment_terms: source.payment_terms,
      internal_manager: source.internal_manager,
      internal_notes: source.internal_notes
        ? `Cópia de ${source.code}\n${source.internal_notes}`
        : `Cópia de ${source.code}`,
      technical_notes: source.technical_notes,
    }),
    code,
    created_by: createdBy,
    updated_at: new Date().toISOString(),
    approved_at: null,
    approved_by: null,
  };

  const { data, error } = await supabase
    .from('master_topography_quotes')
    .insert(payload)
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw new Error(error.message || 'Falha ao duplicar orçamento.');
  const quote = parseRow(data as Record<string, unknown>);

  const { duplicateQuoteStructure } = await import('./quoteStructureService');
  await duplicateQuoteStructure(supabase, id, quote.id);
  return quote;
}

/**
 * Converte orçamento em projeto corporativo (uma única vez).
 */
export async function convertQuoteToProject(
  supabase: SupabaseClient,
  quoteId: string,
  userId: string | null,
): Promise<{ quote: MasterTopographyQuote; projectId: string; projectCode: string }> {
  const quote = await getTopographyQuoteById(supabase, quoteId);
  if (!quote) throw new Error('Orçamento não encontrado.');
  if (quote.converted_project_id || quote.status === 'CONVERTIDO') {
    throw new Error('Este orçamento já foi convertido em projeto.');
  }
  if (quote.is_archived) throw new Error('Orçamento arquivado não pode ser convertido.');
  if (quote.status === 'RECUSADO' || quote.status === 'CANCELADO' || quote.status === 'EXPIRADO') {
    throw new Error('Orçamento neste status não pode ser convertido.');
  }

  const projectInput: MasterTopographyProjectInput = {
    title: (
      quote.title ||
      `${topographyServiceTypeLabel(quote.service_type)} — ${quote.client_name}`
    ).slice(0, 200),
    client_name: quote.client_name,
    client_contact_name: quote.contact_name,
    client_phone: quote.phone,
    client_email: quote.email,
    category: quote.category,
    service_type: quote.service_type,
    description: quote.description,
    status: 'RASCUNHO',
    priority: 'NORMAL',
    financial_situation: 'NAO_FATURADO',
    city: quote.city,
    state: quote.state,
    address: quote.address,
    distance_from_parauapebas_km: quote.distance_km,
    contract_value: quote.final_value ?? quote.estimated_value,
    valor_recebido: 0,
    payment_terms:
      [quote.payment_method, quote.payment_terms].filter(Boolean).join(' — ') || null,
    origin_budget_number: quote.code,
    internal_manager: quote.internal_manager,
    technical_notes: quote.technical_notes,
    team_notes: quote.internal_notes,
  };

  const project = await createTopographyProject(supabase, projectInput, userId);

  const { data, error } = await supabase
    .from('master_topography_quotes')
    .update({
      status: 'CONVERTIDO',
      converted_project_id: project.id,
      approved_at: quote.approved_at || new Date().toISOString(),
      approved_by: quote.approved_by || userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', quoteId)
    .is('converted_project_id', null)
    .select(SELECT_COLUMNS)
    .maybeSingle();

  if (error) throw new Error(error.message || 'Falha ao marcar orçamento como convertido.');
  if (!data) {
    throw new Error('Conversão bloqueada: orçamento já convertido por outra operação.');
  }

  return {
    quote: parseRow(data as Record<string, unknown>),
    projectId: project.id,
    projectCode: project.code,
  };
}

export async function logTopographyQuoteAudit(
  supabase: SupabaseClient,
  params: {
    userId: string | null;
    action: string;
    entityId: string;
    description: string;
    oldData?: unknown;
    newData?: unknown;
  },
): Promise<void> {
  try {
    let tenantId: string | null = null;
    if (params.userId) {
      const { data: u } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', params.userId)
        .maybeSingle();
      tenantId = u?.tenant_id ? String(u.tenant_id) : null;
    }
    await supabase.from('audit_logs').insert({
      tenant_id: tenantId,
      company_id: tenantId,
      user_id: params.userId,
      action: params.action,
      module: 'TOPOGRAPHY',
      description: `${params.description} [${params.entityId}]`,
      old_data: params.oldData ?? null,
      new_data: params.newData ?? null,
    });
  } catch {
    /* auditoria não bloqueia */
  }
}
