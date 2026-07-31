import type { SupabaseClient } from '@supabase/supabase-js';
import { EQUIPMENT_ACTIVE_STATUS_CODES } from './equipmentStatuses';
import type {
  MasterTopographyEquipment,
  MasterTopographyEquipmentInput,
  MasterTopographyEquipmentKpis,
  MasterTopographyEquipmentListFilters,
  MasterTopographyEquipmentListResult,
} from './equipmentTypes';

const SELECT_COLUMNS = `
  id, code, name, category, manufacturer, model, serial_number, asset_number,
  purchase_date, purchase_value, warranty_until, supplier, invoice_number,
  cost_center_id, status, location, responsible_user_id, responsible_name,
  usage_hours, last_calibration_date, next_calibration_date, notes,
  photo_url, qr_payload, is_archived, created_by, created_at, updated_at
`
  .replace(/\s+/g, ' ')
  .trim();

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function plusDaysIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function parseRow(row: Record<string, unknown>): MasterTopographyEquipment {
  return {
    id: String(row.id),
    code: String(row.code || ''),
    name: String(row.name || ''),
    category: row.category as MasterTopographyEquipment['category'],
    manufacturer: row.manufacturer ? String(row.manufacturer) : null,
    model: row.model ? String(row.model) : null,
    serial_number: row.serial_number ? String(row.serial_number) : null,
    asset_number: row.asset_number ? String(row.asset_number) : null,
    purchase_date: row.purchase_date ? String(row.purchase_date).slice(0, 10) : null,
    purchase_value: row.purchase_value == null ? null : Number(row.purchase_value),
    warranty_until: row.warranty_until ? String(row.warranty_until).slice(0, 10) : null,
    supplier: row.supplier ? String(row.supplier) : null,
    invoice_number: row.invoice_number ? String(row.invoice_number) : null,
    cost_center_id: row.cost_center_id ? String(row.cost_center_id) : null,
    status: row.status as MasterTopographyEquipment['status'],
    location: row.location ? String(row.location) : null,
    responsible_user_id: row.responsible_user_id ? String(row.responsible_user_id) : null,
    responsible_name: row.responsible_name ? String(row.responsible_name) : null,
    usage_hours: Number(row.usage_hours || 0),
    last_calibration_date: row.last_calibration_date
      ? String(row.last_calibration_date).slice(0, 10)
      : null,
    next_calibration_date: row.next_calibration_date
      ? String(row.next_calibration_date).slice(0, 10)
      : null,
    notes: row.notes ? String(row.notes) : null,
    photo_url: row.photo_url ? String(row.photo_url) : null,
    qr_payload: row.qr_payload ? String(row.qr_payload) : null,
    is_archived: Boolean(row.is_archived),
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  };
}

function inputToRow(input: MasterTopographyEquipmentInput) {
  return {
    name: input.name,
    category: input.category,
    manufacturer: input.manufacturer ?? null,
    model: input.model ?? null,
    serial_number: input.serial_number ?? null,
    asset_number: input.asset_number ?? null,
    purchase_date: input.purchase_date ?? null,
    purchase_value: input.purchase_value ?? null,
    warranty_until: input.warranty_until ?? null,
    supplier: input.supplier ?? null,
    invoice_number: input.invoice_number ?? null,
    cost_center_id: input.cost_center_id ?? null,
    status: input.status,
    location: input.location ?? null,
    responsible_user_id: input.responsible_user_id ?? null,
    responsible_name: input.responsible_name ?? null,
    usage_hours: input.usage_hours ?? 0,
    last_calibration_date: input.last_calibration_date ?? null,
    next_calibration_date: input.next_calibration_date ?? null,
    notes: input.notes ?? null,
    photo_url: input.photo_url ?? null,
    qr_payload: input.qr_payload ?? null,
  };
}

function emptyKpis(): MasterTopographyEquipmentKpis {
  return {
    total: 0,
    available: 0,
    inUse: 0,
    reserved: 0,
    maintenance: 0,
    calibration: 0,
    decommissioned: 0,
    patrimonialValue: 0,
    calibrationDueSoon: 0,
  };
}

export async function generateTopographyEquipmentCode(
  supabase: SupabaseClient,
  year = new Date().getFullYear(),
): Promise<string> {
  const { data, error } = await supabase.rpc('generate_next_topography_equipment_code', {
    p_year: year,
  });
  if (error) throw new Error(error.message || 'Falha ao gerar código do equipamento.');
  const code = String(data || '').trim();
  if (!/^EQP-\d{4}-\d{4}$/.test(code)) {
    throw new Error('Código de equipamento inválido retornado pelo servidor.');
  }
  return code;
}

function applyListFilters(
  query: {
    eq: (col: string, val: unknown) => typeof query;
    ilike: (col: string, val: string) => typeof query;
    or: (expr: string) => typeof query;
  },
  filters: MasterTopographyEquipmentListFilters,
) {
  if (!filters.includeArchived) {
    query = query.eq('is_archived', false);
  }
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.category) query = query.eq('category', filters.category);
  if (filters.location) query = query.ilike('location', `%${filters.location}%`);
  if (filters.responsible) {
    query = query.or(
      `responsible_name.ilike.%${filters.responsible.replace(/[%_,]/g, '')}%,responsible_user_id.eq.${filters.responsible}`,
    );
  }

  const q = String(filters.q || '').trim();
  if (q) {
    const escaped = q.replace(/[%_,]/g, '');
    query = query.or(
      [
        `code.ilike.%${escaped}%`,
        `name.ilike.%${escaped}%`,
        `serial_number.ilike.%${escaped}%`,
        `asset_number.ilike.%${escaped}%`,
        `manufacturer.ilike.%${escaped}%`,
        `model.ilike.%${escaped}%`,
      ].join(','),
    );
  }
  return query;
}

export async function computeTopographyEquipmentKpis(
  supabase: SupabaseClient,
  filters: MasterTopographyEquipmentListFilters = {},
): Promise<MasterTopographyEquipmentKpis> {
  const today = todayIso();
  const horizon = plusDaysIso(30);

  let query = supabase
    .from('master_topography_equipment')
    .select('id, status, purchase_value, next_calibration_date, is_archived');

  query = applyListFilters(query, filters);

  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Falha ao calcular KPIs de equipamentos.');

  const kpis = emptyKpis();
  for (const row of data || []) {
    const status = String(row.status || '');
    const archived = Boolean(row.is_archived);
    if (!archived) {
      kpis.total += 1;
      if (status === 'AVAILABLE') kpis.available += 1;
      if (status === 'IN_USE') kpis.inUse += 1;
      if (status === 'RESERVED') kpis.reserved += 1;
      if (status === 'MAINTENANCE') kpis.maintenance += 1;
      if (status === 'CALIBRATION') kpis.calibration += 1;
      if (status === 'DECOMMISSIONED') kpis.decommissioned += 1;

      if (EQUIPMENT_ACTIVE_STATUS_CODES.includes(status as never)) {
        kpis.patrimonialValue += Number(row.purchase_value || 0);
      }

      const nextCal = row.next_calibration_date
        ? String(row.next_calibration_date).slice(0, 10)
        : '';
      if (
        nextCal &&
        status !== 'DECOMMISSIONED' &&
        nextCal <= horizon
      ) {
        kpis.calibrationDueSoon += 1;
      }
      // include overdue (nextCal < today) already covered by <= horizon
      void today;
    }
  }

  kpis.patrimonialValue = Math.round(kpis.patrimonialValue * 100) / 100;
  return kpis;
}

export async function listTopographyEquipment(
  supabase: SupabaseClient,
  filters: MasterTopographyEquipmentListFilters = {},
): Promise<MasterTopographyEquipmentListResult> {
  const page = Math.max(1, Math.trunc(filters.page || 1));
  const limit = Math.min(100, Math.max(1, Math.trunc(filters.limit || 20)));
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const sort = filters.sort || 'created_at';
  const ascending = (filters.order || 'desc') === 'asc';

  let query = supabase
    .from('master_topography_equipment')
    .select(SELECT_COLUMNS, { count: 'exact' });

  query = applyListFilters(query, filters);
  query = query.order(sort, { ascending }).range(from, to);

  const [{ data, error, count }, kpis] = await Promise.all([
    query,
    computeTopographyEquipmentKpis(supabase, filters),
  ]);

  if (error) throw new Error(error.message || 'Falha ao listar equipamentos.');

  return {
    equipment: (data || []).map((row) => parseRow(row as Record<string, unknown>)),
    total: count ?? 0,
    page,
    limit,
    kpis,
  };
}

export async function getTopographyEquipmentById(
  supabase: SupabaseClient,
  id: string,
): Promise<MasterTopographyEquipment | null> {
  const { data, error } = await supabase
    .from('master_topography_equipment')
    .select(SELECT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message || 'Falha ao carregar equipamento.');
  if (!data) return null;
  return parseRow(data as Record<string, unknown>);
}

function mapSerialUniqueError(error: { message?: string; code?: string }): never {
  const msg = String(error.message || '');
  if (
    error.code === '23505' ||
    msg.includes('uq_master_topo_equipment_serial_number') ||
    msg.toLowerCase().includes('serial_number')
  ) {
    throw new Error('Número de série já cadastrado para outro equipamento.');
  }
  throw new Error(msg || 'Falha ao gravar equipamento.');
}

export async function createTopographyEquipment(
  supabase: SupabaseClient,
  input: MasterTopographyEquipmentInput,
  createdBy: string | null,
): Promise<MasterTopographyEquipment> {
  const code = await generateTopographyEquipmentCode(supabase);
  const payload = {
    ...inputToRow(input),
    code,
    created_by: createdBy,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('master_topography_equipment')
    .insert(payload)
    .select(SELECT_COLUMNS)
    .single();

  if (error) mapSerialUniqueError(error);
  return parseRow(data as Record<string, unknown>);
}

export async function updateTopographyEquipment(
  supabase: SupabaseClient,
  id: string,
  input: MasterTopographyEquipmentInput,
): Promise<MasterTopographyEquipment> {
  const payload = {
    ...inputToRow(input),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('master_topography_equipment')
    .update(payload)
    .eq('id', id)
    .select(SELECT_COLUMNS)
    .single();

  if (error) mapSerialUniqueError(error);
  return parseRow(data as Record<string, unknown>);
}

export async function patchTopographyEquipmentFields(
  supabase: SupabaseClient,
  id: string,
  fields: Record<string, unknown>,
): Promise<MasterTopographyEquipment> {
  const { data, error } = await supabase
    .from('master_topography_equipment')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(SELECT_COLUMNS)
    .single();

  if (error) mapSerialUniqueError(error);
  return parseRow(data as Record<string, unknown>);
}

export async function logTopographyEquipmentAudit(
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
