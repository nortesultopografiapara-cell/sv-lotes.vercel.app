import type { SupabaseClient } from '@supabase/supabase-js';
import { computeProjectFinancials } from './projectFinancials';
import { TOPOGRAPHY_ACTIVE_STATUS_CODES } from './statuses';
import type {
  MasterTopographyProject,
  MasterTopographyProjectInput,
  MasterTopographyProjectKpis,
  MasterTopographyProjectListFilters,
  MasterTopographyProjectListResult,
} from './types';

const SELECT_COLUMNS = `
  id, code, title, client_name, client_contact_name, client_phone, client_email,
  category, service_type, origin, description, status, priority, financial_situation,
  city, state, address, latitude, longitude, distance_from_parauapebas_km,
  contract_date, planned_start_date, planned_end_date, actual_end_date,
  contract_value, valor_recebido, payment_terms, origin_budget_number,
  internal_manager, technical_manager, team_notes,
  progress_percent, physical_progress_percent, current_stage,
  technical_notes, pending_items, next_action, next_action_date,
  is_archived, created_by, created_at, updated_at
`.replace(/\s+/g, ' ').trim();

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStartIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function parseRow(row: Record<string, unknown>): MasterTopographyProject {
  const contractValue = row.contract_value == null ? null : Number(row.contract_value);
  const valorRecebido = Number(row.valor_recebido || 0);
  const finances = computeProjectFinancials(contractValue, valorRecebido);

  return {
    id: String(row.id),
    code: String(row.code || ''),
    title: String(row.title || ''),
    client_name: String(row.client_name || ''),
    client_contact_name: row.client_contact_name ? String(row.client_contact_name) : null,
    client_phone: row.client_phone ? String(row.client_phone) : null,
    client_email: row.client_email ? String(row.client_email) : null,
    category: row.category as MasterTopographyProject['category'],
    service_type: row.service_type as MasterTopographyProject['service_type'],
    origin: (row.origin as MasterTopographyProject['origin']) ?? null,
    description: row.description ? String(row.description) : null,
    status: row.status as MasterTopographyProject['status'],
    priority: row.priority as MasterTopographyProject['priority'],
    financial_situation: row.financial_situation as MasterTopographyProject['financial_situation'],
    city: row.city ? String(row.city) : null,
    state: row.state ? String(row.state) : null,
    address: row.address ? String(row.address) : null,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    distance_from_parauapebas_km:
      row.distance_from_parauapebas_km == null
        ? null
        : Number(row.distance_from_parauapebas_km),
    contract_date: row.contract_date ? String(row.contract_date).slice(0, 10) : null,
    planned_start_date: row.planned_start_date
      ? String(row.planned_start_date).slice(0, 10)
      : null,
    planned_end_date: row.planned_end_date ? String(row.planned_end_date).slice(0, 10) : null,
    actual_end_date: row.actual_end_date ? String(row.actual_end_date).slice(0, 10) : null,
    contract_value: contractValue,
    valor_recebido: finances.valor_recebido,
    saldo_receber: finances.saldo_receber,
    percentual_recebido: finances.percentual_recebido,
    valorRecebido: finances.valorRecebido,
    saldoReceber: finances.saldoReceber,
    percentualRecebido: finances.percentualRecebido,
    payment_terms: row.payment_terms ? String(row.payment_terms) : null,
    origin_budget_number: row.origin_budget_number ? String(row.origin_budget_number) : null,
    internal_manager: row.internal_manager ? String(row.internal_manager) : null,
    technical_manager: row.technical_manager ? String(row.technical_manager) : null,
    team_notes: row.team_notes ? String(row.team_notes) : null,
    progress_percent: Number(row.progress_percent || 0),
    physical_progress_percent: Number(row.physical_progress_percent || 0),
    current_stage: row.current_stage ? String(row.current_stage) : null,
    technical_notes: row.technical_notes ? String(row.technical_notes) : null,
    pending_items: row.pending_items ? String(row.pending_items) : null,
    next_action: row.next_action ? String(row.next_action) : null,
    next_action_date: row.next_action_date ? String(row.next_action_date).slice(0, 10) : null,
    is_archived: Boolean(row.is_archived),
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  };
}

function inputToRow(input: MasterTopographyProjectInput) {
  return {
    title: input.title,
    client_name: input.client_name,
    client_contact_name: input.client_contact_name ?? null,
    client_phone: input.client_phone ?? null,
    client_email: input.client_email ?? null,
    category: input.category,
    service_type: input.service_type,
    origin: input.origin ?? null,
    description: input.description ?? null,
    status: input.status,
    priority: input.priority ?? 'NORMAL',
    financial_situation: input.financial_situation ?? 'NAO_FATURADO',
    city: input.city ?? null,
    state: input.state ?? null,
    address: input.address ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    distance_from_parauapebas_km: input.distance_from_parauapebas_km ?? null,
    contract_date: input.contract_date ?? null,
    planned_start_date: input.planned_start_date ?? null,
    planned_end_date: input.planned_end_date ?? null,
    actual_end_date: input.actual_end_date ?? null,
    contract_value: input.contract_value ?? null,
    valor_recebido: input.valor_recebido ?? 0,
    payment_terms: input.payment_terms ?? null,
    origin_budget_number: input.origin_budget_number ?? null,
    internal_manager: input.internal_manager ?? null,
    technical_manager: input.technical_manager ?? null,
    team_notes: input.team_notes ?? null,
    progress_percent: input.progress_percent ?? 0,
    physical_progress_percent: input.physical_progress_percent ?? 0,
    current_stage: input.current_stage ?? null,
    technical_notes: input.technical_notes ?? null,
    pending_items: input.pending_items ?? null,
    next_action: input.next_action ?? null,
    next_action_date: input.next_action_date ?? null,
  };
}

function emptyKpis(): MasterTopographyProjectKpis {
  return {
    active: 0,
    inField: 0,
    inProcessing: 0,
    overdue: 0,
    completedThisMonth: 0,
    activeContractValue: 0,
    totalContractValue: 0,
    totalReceived: 0,
    totalBalance: 0,
  };
}

export async function generateTopographyProjectCode(
  supabase: SupabaseClient,
  year = new Date().getFullYear(),
): Promise<string> {
  const { data, error } = await supabase.rpc('generate_next_topography_project_code', {
    p_year: year,
  });
  if (error) throw new Error(error.message || 'Falha ao gerar código do projeto.');
  const code = String(data || '').trim();
  if (!/^PRJ-\d{4}-\d{4}$/.test(code)) {
    throw new Error('Código de projeto inválido retornado pelo servidor.');
  }
  return code;
}

function applyListFilters(
  query: {
    eq: (col: string, val: unknown) => typeof query;
    ilike: (col: string, val: string) => typeof query;
    gte: (col: string, val: string) => typeof query;
    lte: (col: string, val: string) => typeof query;
    or: (expr: string) => typeof query;
  },
  filters: MasterTopographyProjectListFilters,
) {
  if (!filters.includeArchived) {
    query = query.eq('is_archived', false);
  }
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.category) query = query.eq('category', filters.category);
  if (filters.serviceType) query = query.eq('service_type', filters.serviceType);
  if (filters.priority) query = query.eq('priority', filters.priority);
  if (filters.city) query = query.ilike('city', `%${filters.city}%`);
  if (filters.manager) {
    query = query.ilike('internal_manager', `%${filters.manager}%`);
  }
  if (filters.fromDate) query = query.gte('created_at', `${filters.fromDate}T00:00:00.000Z`);
  if (filters.toDate) query = query.lte('created_at', `${filters.toDate}T23:59:59.999Z`);

  const q = String(filters.q || '').trim();
  if (q) {
    const escaped = q.replace(/[%_]/g, '');
    query = query.or(
      `code.ilike.%${escaped}%,title.ilike.%${escaped}%,client_name.ilike.%${escaped}%`,
    );
  }
  return query;
}

export async function computeTopographyProjectKpis(
  supabase: SupabaseClient,
  filters: MasterTopographyProjectListFilters = {},
): Promise<MasterTopographyProjectKpis> {
  const today = todayIso();
  const monthStart = monthStartIso();

  let query = supabase
    .from('master_topography_projects')
    .select(
      'id, status, planned_end_date, contract_value, valor_recebido, actual_end_date, updated_at, is_archived',
    );

  query = applyListFilters(query, filters);

  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Falha ao calcular KPIs.');

  const rows = (data || []) as Array<{
    id: string;
    status: string;
    planned_end_date: string | null;
    contract_value: number | null;
    valor_recebido: number | null;
    actual_end_date: string | null;
    updated_at: string | null;
    is_archived: boolean;
  }>;

  const { batchResolveProjectReceived } = await import(
    '@/lib/master/corporateFinance/projectReceivedBridge'
  );
  const bridges = await batchResolveProjectReceived(
    supabase,
    rows.map((r) => ({ id: String(r.id), valor_recebido: Number(r.valor_recebido || 0) })),
  );

  const kpis = emptyKpis();

  for (const row of rows) {
    const contract = Number(row.contract_value || 0);
    const bridge = bridges.get(String(row.id));
    const received = bridge ? bridge.amount : Number(row.valor_recebido || 0);
    const finances = computeProjectFinancials(contract, received);

    // Totais financeiros sempre sobre o conjunto filtrado (incluindo arquivados se pedido)
    kpis.totalContractValue += contract;
    kpis.totalReceived += finances.valor_recebido;
    kpis.totalBalance += finances.saldo_receber;

    if (row.is_archived) continue;
    const status = String(row.status || '');
    if (TOPOGRAPHY_ACTIVE_STATUS_CODES.includes(status as never)) {
      kpis.active += 1;
      kpis.activeContractValue += contract;
    }
    if (status === 'EM_CAMPO') kpis.inField += 1;
    if (status === 'EM_PROCESSAMENTO') kpis.inProcessing += 1;
    if (
      status !== 'CONCLUIDO' &&
      row.planned_end_date &&
      String(row.planned_end_date).slice(0, 10) < today
    ) {
      kpis.overdue += 1;
    }
    if (status === 'CONCLUIDO') {
      const end = row.actual_end_date
        ? String(row.actual_end_date).slice(0, 10)
        : row.updated_at
          ? String(row.updated_at).slice(0, 10)
          : '';
      if (end >= monthStart) kpis.completedThisMonth += 1;
    }
  }

  kpis.totalContractValue = Math.round(kpis.totalContractValue * 100) / 100;
  kpis.totalReceived = Math.round(kpis.totalReceived * 100) / 100;
  kpis.totalBalance = Math.round(kpis.totalBalance * 100) / 100;
  kpis.activeContractValue = Math.round(kpis.activeContractValue * 100) / 100;

  return kpis;
}

export async function listTopographyProjects(
  supabase: SupabaseClient,
  filters: MasterTopographyProjectListFilters = {},
): Promise<MasterTopographyProjectListResult> {
  const page = Math.max(1, Math.trunc(filters.page || 1));
  const limit = Math.min(100, Math.max(1, Math.trunc(filters.limit || 20)));
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const sort = filters.sort || 'created_at';
  const ascending = (filters.order || 'desc') === 'asc';

  let query = supabase
    .from('master_topography_projects')
    .select(SELECT_COLUMNS, { count: 'exact' });

  query = applyListFilters(query, filters);
  query = query.order(sort, { ascending }).range(from, to);

  const [{ data, error, count }, kpis] = await Promise.all([
    query,
    computeTopographyProjectKpis(supabase, filters),
  ]);

  if (error) throw new Error(error.message || 'Falha ao listar projetos.');

  const projects = (data || []).map((row) => parseRow(row as Record<string, unknown>));
  const { batchResolveProjectReceived } = await import(
    '@/lib/master/corporateFinance/projectReceivedBridge'
  );
  const bridges = await batchResolveProjectReceived(
    supabase,
    projects.map((p) => ({ id: p.id, valor_recebido: p.valor_recebido })),
  );

  const enriched = projects.map((p) => {
    const b = bridges.get(p.id);
    if (!b) return { ...p, received_source: 'LEGACY' as const, received_effective: p.valor_recebido };
    const finances = computeProjectFinancials(p.contract_value, b.amount);
    return {
      ...p,
      received_source: b.source,
      received_effective: b.amount,
      saldo_receber: finances.saldo_receber,
      percentual_recebido: finances.percentual_recebido,
      saldoReceber: finances.saldoReceber,
      percentualRecebido: finances.percentualRecebido,
      // Display aliases keep effective received for list cards without mutating DB column
      valorRecebido: b.amount,
    };
  });

  // Recalcula KPIs financeiros com bridge
  let totalReceived = 0;
  let totalBalance = 0;
  for (const p of enriched) {
    totalReceived += Number(p.received_effective ?? p.valor_recebido);
    totalBalance += Number(p.saldo_receber);
  }
  const mergedKpis = {
    ...kpis,
    totalReceived: Math.round(totalReceived * 100) / 100,
    totalBalance: Math.round(totalBalance * 100) / 100,
  };

  return {
    projects: enriched,
    total: count ?? 0,
    page,
    limit,
    kpis: mergedKpis,
  };
}

export async function getTopographyProjectById(
  supabase: SupabaseClient,
  id: string,
): Promise<MasterTopographyProject | null> {
  const { data, error } = await supabase
    .from('master_topography_projects')
    .select(SELECT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message || 'Falha ao carregar projeto.');
  if (!data) return null;
  const project = parseRow(data as Record<string, unknown>);
  const { resolveProjectReceivedBridge } = await import(
    '@/lib/master/corporateFinance/projectReceivedBridge'
  );
  const bridge = await resolveProjectReceivedBridge(
    supabase,
    project.id,
    project.valor_recebido,
  );
  const finances = computeProjectFinancials(project.contract_value, bridge.amount);
  return {
    ...project,
    received_source: bridge.source,
    received_effective: bridge.amount,
    saldo_receber: finances.saldo_receber,
    percentual_recebido: finances.percentual_recebido,
    saldoReceber: finances.saldoReceber,
    percentualRecebido: finances.percentualRecebido,
    valorRecebido: bridge.amount,
  };
}

export async function createTopographyProject(
  supabase: SupabaseClient,
  input: MasterTopographyProjectInput,
  createdBy: string | null,
): Promise<MasterTopographyProject> {
  const code = await generateTopographyProjectCode(supabase);
  const payload = {
    ...inputToRow(input),
    code,
    created_by: createdBy,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('master_topography_projects')
    .insert(payload)
    .select(SELECT_COLUMNS)
    .single();

  if (error) throw new Error(error.message || 'Falha ao criar projeto.');
  return parseRow(data as Record<string, unknown>);
}

export async function updateTopographyProject(
  supabase: SupabaseClient,
  id: string,
  input: MasterTopographyProjectInput,
): Promise<MasterTopographyProject> {
  const payload = {
    ...inputToRow(input),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('master_topography_projects')
    .update(payload)
    .eq('id', id)
    .select(SELECT_COLUMNS)
    .single();

  if (error) throw new Error(error.message || 'Falha ao atualizar projeto.');
  return parseRow(data as Record<string, unknown>);
}

export async function patchTopographyProjectFields(
  supabase: SupabaseClient,
  id: string,
  fields: Record<string, unknown>,
): Promise<MasterTopographyProject> {
  const { data, error } = await supabase
    .from('master_topography_projects')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(SELECT_COLUMNS)
    .single();

  if (error) throw new Error(error.message || 'Falha ao atualizar projeto.');
  return parseRow(data as Record<string, unknown>);
}

export async function archiveTopographyProject(
  supabase: SupabaseClient,
  id: string,
): Promise<MasterTopographyProject> {
  return patchTopographyProjectFields(supabase, id, {
    is_archived: true,
    status: 'ARQUIVADO',
  });
}

export async function restoreTopographyProject(
  supabase: SupabaseClient,
  id: string,
  status = 'PLANEJAMENTO',
): Promise<MasterTopographyProject> {
  return patchTopographyProjectFields(supabase, id, {
    is_archived: false,
    status,
  });
}

export async function logTopographyProjectAudit(
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
    /* auditoria não deve bloquear o fluxo operacional */
  }
}
