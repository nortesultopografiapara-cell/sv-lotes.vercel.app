import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  MasterTopographyEquipmentMaintenance,
  MasterTopographyEquipmentMaintenanceInput,
} from './equipmentMaintenanceTypes';
import {
  getTopographyEquipmentById,
  logTopographyEquipmentAudit,
  patchTopographyEquipmentFields,
} from './equipmentService';
import type { EquipmentStatusCode } from './equipmentStatuses';

const SELECT_COLUMNS = `
  id, equipment_id, tipo, status, description, supplier, scheduled_at,
  performed_at, cost, next_review_at, parts, notes, payable_id,
  previous_equipment_status, is_archived, created_by, created_at, updated_at
`
  .replace(/\s+/g, ' ')
  .trim();

function parseRow(row: Record<string, unknown>): MasterTopographyEquipmentMaintenance {
  return {
    id: String(row.id),
    equipment_id: String(row.equipment_id),
    tipo: row.tipo as MasterTopographyEquipmentMaintenance['tipo'],
    status: row.status as MasterTopographyEquipmentMaintenance['status'],
    description: String(row.description || ''),
    supplier: row.supplier ? String(row.supplier) : null,
    scheduled_at: row.scheduled_at ? String(row.scheduled_at).slice(0, 10) : null,
    performed_at: row.performed_at ? String(row.performed_at).slice(0, 10) : null,
    cost: row.cost == null ? null : Number(row.cost),
    next_review_at: row.next_review_at ? String(row.next_review_at).slice(0, 10) : null,
    parts: row.parts ? String(row.parts) : null,
    notes: row.notes ? String(row.notes) : null,
    payable_id: row.payable_id ? String(row.payable_id) : null,
    previous_equipment_status: row.previous_equipment_status
      ? String(row.previous_equipment_status)
      : null,
    is_archived: Boolean(row.is_archived),
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  };
}

function inputToRow(input: MasterTopographyEquipmentMaintenanceInput) {
  return {
    tipo: input.tipo,
    status: input.status,
    description: input.description,
    supplier: input.supplier ?? null,
    scheduled_at: input.scheduled_at ?? null,
    performed_at: input.performed_at ?? null,
    cost: input.cost ?? null,
    next_review_at: input.next_review_at ?? null,
    parts: input.parts ?? null,
    notes: input.notes ?? null,
  };
}

export async function listEquipmentMaintenance(
  supabase: SupabaseClient,
  equipmentId: string,
  opts?: { includeArchived?: boolean },
): Promise<MasterTopographyEquipmentMaintenance[]> {
  let query = supabase
    .from('master_topography_equipment_maintenance')
    .select(SELECT_COLUMNS)
    .eq('equipment_id', equipmentId)
    .order('created_at', { ascending: false });

  if (!opts?.includeArchived) {
    query = query.eq('is_archived', false);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Falha ao listar manutenções.');
  return (data || []).map((row) => parseRow(row as unknown as Record<string, unknown>));
}

export async function getEquipmentMaintenanceById(
  supabase: SupabaseClient,
  equipmentId: string,
  maintenanceId: string,
): Promise<MasterTopographyEquipmentMaintenance | null> {
  const { data, error } = await supabase
    .from('master_topography_equipment_maintenance')
    .select(SELECT_COLUMNS)
    .eq('id', maintenanceId)
    .eq('equipment_id', equipmentId)
    .maybeSingle();
  if (error) throw new Error(error.message || 'Falha ao carregar manutenção.');
  if (!data) return null;
  return parseRow(data as unknown as Record<string, unknown>);
}

async function applyStatusSideEffects(
  supabase: SupabaseClient,
  params: {
    equipmentId: string;
    equipmentCode: string;
    equipmentStatus: EquipmentStatusCode;
    previous: MasterTopographyEquipmentMaintenance | null;
    next: MasterTopographyEquipmentMaintenance;
    userId: string | null;
  },
): Promise<MasterTopographyEquipmentMaintenance> {
  const { previous, next } = params;
  const prevStatus = previous?.status;
  let updated = next;

  const enteringProgress =
    next.status === 'IN_PROGRESS' && prevStatus !== 'IN_PROGRESS';
  const completing = next.status === 'DONE' && prevStatus !== 'DONE';
  const canceling = next.status === 'CANCELED' && prevStatus !== 'CANCELED';

  if (enteringProgress) {
    const targetStatus: EquipmentStatusCode =
      next.tipo === 'CALIBRATION' ? 'CALIBRATION' : 'MAINTENANCE';
    const previousEquipmentStatus = params.equipmentStatus;

    const { data, error } = await supabase
      .from('master_topography_equipment_maintenance')
      .update({
        previous_equipment_status: previousEquipmentStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', next.id)
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw new Error(error.message || 'Falha ao gravar status anterior.');
    updated = parseRow(data as unknown as Record<string, unknown>);

    if (
      params.equipmentStatus !== 'DECOMMISSIONED' &&
      params.equipmentStatus !== targetStatus
    ) {
      await patchTopographyEquipmentFields(supabase, params.equipmentId, {
        status: targetStatus,
      });
      await logTopographyEquipmentAudit(supabase, {
        userId: params.userId,
        action: 'TOPOGRAPHY_EQUIPMENT_STATUS_CHANGED',
        entityId: params.equipmentId,
        description: `Status ${params.equipmentCode}: ${params.equipmentStatus} → ${targetStatus} (manutenção)`,
        oldData: { status: params.equipmentStatus },
        newData: { status: targetStatus, maintenance_id: next.id },
      });
    }
  }

  if (completing) {
    const fields: Record<string, unknown> = {};
    if (next.tipo === 'CALIBRATION') {
      if (next.performed_at) fields.last_calibration_date = next.performed_at;
      if (next.next_review_at) fields.next_calibration_date = next.next_review_at;
    }

    const restore =
      updated.previous_equipment_status || previous?.previous_equipment_status || null;
    const current = await getTopographyEquipmentById(supabase, params.equipmentId);
    if (
      restore &&
      current &&
      (current.status === 'MAINTENANCE' || current.status === 'CALIBRATION')
    ) {
      fields.status = restore;
    }

    if (Object.keys(fields).length > 0) {
      await patchTopographyEquipmentFields(supabase, params.equipmentId, fields);
      if (fields.status) {
        await logTopographyEquipmentAudit(supabase, {
          userId: params.userId,
          action: 'TOPOGRAPHY_EQUIPMENT_STATUS_CHANGED',
          entityId: params.equipmentId,
          description: `Status ${params.equipmentCode} restaurado após manutenção: ${fields.status}`,
          oldData: { status: current?.status },
          newData: { status: fields.status, maintenance_id: next.id },
        });
      }
    }
  }

  if (canceling) {
    const restore =
      updated.previous_equipment_status || previous?.previous_equipment_status || null;
    const current = await getTopographyEquipmentById(supabase, params.equipmentId);
    if (
      restore &&
      current &&
      (current.status === 'MAINTENANCE' || current.status === 'CALIBRATION')
    ) {
      await patchTopographyEquipmentFields(supabase, params.equipmentId, {
        status: restore,
      });
    }
  }

  return updated;
}

export async function createEquipmentMaintenance(
  supabase: SupabaseClient,
  params: {
    equipmentId: string;
    input: MasterTopographyEquipmentMaintenanceInput;
    createdBy: string | null;
  },
): Promise<MasterTopographyEquipmentMaintenance> {
  const equipment = await getTopographyEquipmentById(supabase, params.equipmentId);
  if (!equipment) throw new Error('Equipamento não encontrado.');

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('master_topography_equipment_maintenance')
    .insert({
      equipment_id: params.equipmentId,
      ...inputToRow(params.input),
      created_by: params.createdBy,
      created_at: now,
      updated_at: now,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) throw new Error(error.message || 'Falha ao criar manutenção.');

  let row = parseRow(data as unknown as Record<string, unknown>);

  row = await applyStatusSideEffects(supabase, {
    equipmentId: params.equipmentId,
    equipmentCode: equipment.code,
    equipmentStatus: equipment.status,
    previous: null,
    next: row,
    userId: params.createdBy,
  });

  await logTopographyEquipmentAudit(supabase, {
    userId: params.createdBy,
    action: 'TOPOGRAPHY_EQUIPMENT_MAINTENANCE_CREATED',
    entityId: params.equipmentId,
    description: `Manutenção ${row.tipo} (${row.status}) em ${equipment.code}`,
    newData: { maintenance_id: row.id, tipo: row.tipo, status: row.status },
  });

  return row;
}

export async function updateEquipmentMaintenance(
  supabase: SupabaseClient,
  params: {
    equipmentId: string;
    maintenanceId: string;
    patch: Partial<MasterTopographyEquipmentMaintenanceInput> & {
      is_archived?: boolean;
    };
    userId: string | null;
  },
): Promise<MasterTopographyEquipmentMaintenance> {
  const equipment = await getTopographyEquipmentById(supabase, params.equipmentId);
  if (!equipment) throw new Error('Equipamento não encontrado.');

  const previous = await getEquipmentMaintenanceById(
    supabase,
    params.equipmentId,
    params.maintenanceId,
  );
  if (!previous) throw new Error('Manutenção não encontrada.');

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (params.patch.tipo != null) payload.tipo = params.patch.tipo;
  if (params.patch.status != null) payload.status = params.patch.status;
  if (params.patch.description != null) payload.description = params.patch.description;
  if (params.patch.supplier !== undefined) payload.supplier = params.patch.supplier;
  if (params.patch.scheduled_at !== undefined) {
    payload.scheduled_at = params.patch.scheduled_at;
  }
  if (params.patch.performed_at !== undefined) {
    payload.performed_at = params.patch.performed_at;
  }
  if (params.patch.cost !== undefined) payload.cost = params.patch.cost;
  if (params.patch.next_review_at !== undefined) {
    payload.next_review_at = params.patch.next_review_at;
  }
  if (params.patch.parts !== undefined) payload.parts = params.patch.parts;
  if (params.patch.notes !== undefined) payload.notes = params.patch.notes;
  if (params.patch.is_archived != null) payload.is_archived = params.patch.is_archived;

  const { data, error } = await supabase
    .from('master_topography_equipment_maintenance')
    .update(payload)
    .eq('id', params.maintenanceId)
    .eq('equipment_id', params.equipmentId)
    .select(SELECT_COLUMNS)
    .single();

  if (error) throw new Error(error.message || 'Falha ao atualizar manutenção.');

  let row = parseRow(data as unknown as Record<string, unknown>);

  row = await applyStatusSideEffects(supabase, {
    equipmentId: params.equipmentId,
    equipmentCode: equipment.code,
    equipmentStatus: equipment.status,
    previous,
    next: row,
    userId: params.userId,
  });

  await logTopographyEquipmentAudit(supabase, {
    userId: params.userId,
    action: 'TOPOGRAPHY_EQUIPMENT_MAINTENANCE_UPDATED',
    entityId: params.equipmentId,
    description: `Manutenção atualizada em ${equipment.code}: ${previous.status} → ${row.status}`,
    oldData: { maintenance_id: previous.id, status: previous.status },
    newData: { maintenance_id: row.id, status: row.status, cost: row.cost },
  });

  return row;
}
