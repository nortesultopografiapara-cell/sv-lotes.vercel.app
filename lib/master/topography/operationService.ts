import type { SupabaseClient } from '@supabase/supabase-js';
import type { OperationPriorityCode, OperationStatusCode } from './operationStatuses';
import type {
  MasterTopographyOperation,
  MasterTopographyOperationInput,
  MasterTopographyOperationKpis,
  MasterTopographyOperationListFilters,
  MasterTopographyOperationListResult,
} from './operationTypes';

const SELECT_COLUMNS = `
  id, code, title, description, project_id, quote_id, client_name, service_type,
  status, priority, scheduled_start, scheduled_end, actual_start, actual_end,
  location_name, address, latitude, longitude, responsible_user_id, responsible_name,
  estimated_cost, actual_cost, notes, is_archived, created_by, created_at, updated_at
`
  .replace(/\s+/g, ' ')
  .trim();

function parseRow(row: Record<string, unknown>): MasterTopographyOperation {
  return {
    id: String(row.id),
    code: String(row.code || ''),
    title: String(row.title || ''),
    description: row.description ? String(row.description) : null,
    project_id: row.project_id ? String(row.project_id) : null,
    quote_id: row.quote_id ? String(row.quote_id) : null,
    client_name: row.client_name ? String(row.client_name) : null,
    service_type: row.service_type ? String(row.service_type) : null,
    status: row.status as OperationStatusCode,
    priority: row.priority as OperationPriorityCode,
    scheduled_start: row.scheduled_start ? String(row.scheduled_start) : null,
    scheduled_end: row.scheduled_end ? String(row.scheduled_end) : null,
    actual_start: row.actual_start ? String(row.actual_start) : null,
    actual_end: row.actual_end ? String(row.actual_end) : null,
    location_name: row.location_name ? String(row.location_name) : null,
    address: row.address ? String(row.address) : null,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    responsible_user_id: row.responsible_user_id ? String(row.responsible_user_id) : null,
    responsible_name: row.responsible_name ? String(row.responsible_name) : null,
    estimated_cost: row.estimated_cost == null ? null : Number(row.estimated_cost),
    actual_cost: row.actual_cost == null ? null : Number(row.actual_cost),
    notes: row.notes ? String(row.notes) : null,
    is_archived: Boolean(row.is_archived),
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  };
}

function inputToRow(input: MasterTopographyOperationInput) {
  return {
    title: input.title,
    description: input.description ?? null,
    project_id: input.project_id ?? null,
    quote_id: input.quote_id ?? null,
    client_name: input.client_name ?? null,
    service_type: input.service_type ?? null,
    status: input.status,
    priority: input.priority,
    scheduled_start: input.scheduled_start ?? null,
    scheduled_end: input.scheduled_end ?? null,
    actual_start: input.actual_start ?? null,
    actual_end: input.actual_end ?? null,
    location_name: input.location_name ?? null,
    address: input.address ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    responsible_user_id: input.responsible_user_id ?? null,
    responsible_name: input.responsible_name ?? null,
    estimated_cost: input.estimated_cost ?? null,
    actual_cost: input.actual_cost ?? null,
    notes: input.notes ?? null,
  };
}

function emptyKpis(): MasterTopographyOperationKpis {
  return {
    total: 0,
    draft: 0,
    planned: 0,
    scheduled: 0,
    inField: 0,
    processing: 0,
    waitingClient: 0,
    completed: 0,
    canceled: 0,
    overdue: 0,
    estimatedCostSum: 0,
    actualCostSum: 0,
  };
}

export async function generateTopographyOperationCode(
  supabase: SupabaseClient,
  year = new Date().getFullYear(),
): Promise<string> {
  const { data, error } = await supabase.rpc('generate_next_topography_operation_code', {
    p_year: year,
  });
  if (error) throw new Error(error.message || 'Falha ao gerar código da operação.');
  const code = String(data || '').trim();
  if (!/^OS-\d{4}-\d{4}$/.test(code)) {
    throw new Error('Código de operação inválido retornado pelo servidor.');
  }
  return code;
}

function applyListFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  filters: MasterTopographyOperationListFilters,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  if (!filters.includeArchived) {
    query = query.eq('is_archived', false);
  }
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.priority) query = query.eq('priority', filters.priority);
  if (filters.projectId) query = query.eq('project_id', filters.projectId);
  if (filters.responsible) {
    const escaped = filters.responsible.replace(/[%_,]/g, '');
    query = query.or(
      `responsible_name.ilike.%${escaped}%,responsible_user_id.eq.${filters.responsible}`,
    );
  }
  if (filters.scheduledFrom) {
    query = query.gte('scheduled_start', filters.scheduledFrom);
  }
  if (filters.scheduledTo) {
    query = query.lte('scheduled_start', filters.scheduledTo);
  }

  const q = String(filters.q || '').trim();
  if (q) {
    const escaped = q.replace(/[%_,]/g, '');
    query = query.or(
      [
        `code.ilike.%${escaped}%`,
        `title.ilike.%${escaped}%`,
        `client_name.ilike.%${escaped}%`,
        `location_name.ilike.%${escaped}%`,
        `service_type.ilike.%${escaped}%`,
        `responsible_name.ilike.%${escaped}%`,
      ].join(','),
    );
  }
  return query;
}

export async function computeTopographyOperationKpis(
  supabase: SupabaseClient,
  filters: MasterTopographyOperationListFilters = {},
): Promise<MasterTopographyOperationKpis> {
  const now = new Date().toISOString();

  let query = supabase
    .from('master_topography_operations')
    .select(
      'id, status, scheduled_end, estimated_cost, actual_cost, is_archived',
    );

  query = applyListFilters(query, filters);

  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Falha ao calcular KPIs de operações.');

  const kpis = emptyKpis();
  const activeStatuses = new Set([
    'DRAFT',
    'PLANNED',
    'SCHEDULED',
    'IN_FIELD',
    'PROCESSING',
    'WAITING_CLIENT',
  ]);

  for (const row of data || []) {
    const status = String(row.status || '');
    const archived = Boolean(row.is_archived);
    if (archived) continue;

    kpis.total += 1;
    if (status === 'DRAFT') kpis.draft += 1;
    if (status === 'PLANNED') kpis.planned += 1;
    if (status === 'SCHEDULED') kpis.scheduled += 1;
    if (status === 'IN_FIELD') kpis.inField += 1;
    if (status === 'PROCESSING') kpis.processing += 1;
    if (status === 'WAITING_CLIENT') kpis.waitingClient += 1;
    if (status === 'COMPLETED') kpis.completed += 1;
    if (status === 'CANCELED') kpis.canceled += 1;

    kpis.estimatedCostSum += Number(row.estimated_cost || 0);
    kpis.actualCostSum += Number(row.actual_cost || 0);

    const end = row.scheduled_end ? String(row.scheduled_end) : '';
    if (end && end < now && activeStatuses.has(status)) {
      kpis.overdue += 1;
    }
  }

  kpis.estimatedCostSum = Math.round(kpis.estimatedCostSum * 100) / 100;
  kpis.actualCostSum = Math.round(kpis.actualCostSum * 100) / 100;
  return kpis;
}

export async function listTopographyOperations(
  supabase: SupabaseClient,
  filters: MasterTopographyOperationListFilters = {},
): Promise<MasterTopographyOperationListResult> {
  const page = Math.max(1, Math.trunc(filters.page || 1));
  const limit = Math.min(100, Math.max(1, Math.trunc(filters.limit || 20)));
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const sort = filters.sort || 'created_at';
  const ascending = (filters.order || 'desc') === 'asc';

  let query = supabase
    .from('master_topography_operations')
    .select(SELECT_COLUMNS, { count: 'exact' });

  query = applyListFilters(query, filters);
  query = query.order(sort, { ascending }).range(from, to);

  const [{ data, error, count }, kpis] = await Promise.all([
    query,
    computeTopographyOperationKpis(supabase, filters),
  ]);

  if (error) throw new Error(error.message || 'Falha ao listar operações.');

  return {
    operations: (data || []).map((row) => parseRow(row as Record<string, unknown>)),
    total: count ?? 0,
    page,
    limit,
    kpis,
  };
}

export async function getTopographyOperationById(
  supabase: SupabaseClient,
  id: string,
): Promise<MasterTopographyOperation | null> {
  const { data, error } = await supabase
    .from('master_topography_operations')
    .select(SELECT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message || 'Falha ao carregar operação.');
  if (!data) return null;
  return parseRow(data as Record<string, unknown>);
}

function mapOperationWriteError(error: { message?: string; code?: string }): never {
  const msg = String(error.message || '');
  if (error.code === '23505' || msg.toLowerCase().includes('code')) {
    throw new Error('Código de operação já utilizado. Tente novamente.');
  }
  if (error.code === '23503') {
    throw new Error('Referência inválida (projeto, orçamento ou responsável).');
  }
  throw new Error(msg || 'Falha ao gravar operação.');
}

export async function createTopographyOperation(
  supabase: SupabaseClient,
  input: MasterTopographyOperationInput,
  createdBy: string | null,
): Promise<MasterTopographyOperation> {
  const code = await generateTopographyOperationCode(supabase);
  const payload = {
    ...inputToRow(input),
    code,
    created_by: createdBy,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('master_topography_operations')
    .insert(payload)
    .select(SELECT_COLUMNS)
    .single();

  if (error) mapOperationWriteError(error);
  return parseRow(data as Record<string, unknown>);
}

/**
 * Atualização completa de campos editáveis.
 * Código é imutável — nunca incluso no payload.
 */
export async function updateTopographyOperation(
  supabase: SupabaseClient,
  id: string,
  input: MasterTopographyOperationInput,
): Promise<MasterTopographyOperation> {
  const payload = {
    ...inputToRow(input),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('master_topography_operations')
    .update(payload)
    .eq('id', id)
    .select(SELECT_COLUMNS)
    .single();

  if (error) mapOperationWriteError(error);
  return parseRow(data as Record<string, unknown>);
}

export async function patchTopographyOperationFields(
  supabase: SupabaseClient,
  id: string,
  fields: Record<string, unknown>,
): Promise<MasterTopographyOperation> {
  const { data, error } = await supabase
    .from('master_topography_operations')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(SELECT_COLUMNS)
    .single();

  if (error) mapOperationWriteError(error);
  return parseRow(data as Record<string, unknown>);
}

export async function logTopographyOperationAudit(
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
