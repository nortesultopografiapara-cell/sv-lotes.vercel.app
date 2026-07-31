import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getTopographyEquipmentById,
  logTopographyEquipmentAudit,
  patchTopographyEquipmentFields,
} from './equipmentService';
import type {
  MasterTopographyOperationEquipmentInput,
  MasterTopographyOperationEquipmentLink,
} from './operationEquipmentTypes';
import { logTopographyOperationAudit } from './operationService';

const SELECT_COLUMNS = `
  id, operation_id, equipment_id, reserved_at, checked_out_at, returned_at,
  condition_out, condition_return, previous_equipment_status, notes,
  created_by, created_at, updated_at
`
  .replace(/\s+/g, ' ')
  .trim();

function parseRow(row: Record<string, unknown>): MasterTopographyOperationEquipmentLink {
  return {
    id: String(row.id),
    operation_id: String(row.operation_id),
    equipment_id: String(row.equipment_id),
    reserved_at: row.reserved_at ? String(row.reserved_at) : null,
    checked_out_at: row.checked_out_at ? String(row.checked_out_at) : null,
    returned_at: row.returned_at ? String(row.returned_at) : null,
    condition_out: row.condition_out ? String(row.condition_out) : null,
    condition_return: row.condition_return ? String(row.condition_return) : null,
    previous_equipment_status: row.previous_equipment_status
      ? String(row.previous_equipment_status)
      : null,
    notes: row.notes ? String(row.notes) : null,
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  };
}

export async function listOperationEquipment(
  supabase: SupabaseClient,
  operationId: string,
): Promise<MasterTopographyOperationEquipmentLink[]> {
  const { data, error } = await supabase
    .from('master_topography_operation_equipment')
    .select(SELECT_COLUMNS)
    .eq('operation_id', operationId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message || 'Falha ao listar equipamentos da OS.');
  const rows = (data || []).map((r) => parseRow(r as unknown as Record<string, unknown>));

  for (const row of rows) {
    const eq = await getTopographyEquipmentById(supabase, row.equipment_id);
    if (eq) {
      row.equipment_code = eq.code;
      row.equipment_name = eq.name;
      row.equipment_status = eq.status;
    }
  }
  return rows;
}

export async function countActiveOperationEquipment(
  supabase: SupabaseClient,
  operationId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('master_topography_operation_equipment')
    .select('id', { count: 'exact', head: true })
    .eq('operation_id', operationId)
    .is('returned_at', null);
  if (error) throw new Error(error.message || 'Falha ao contar equipamentos da OS.');
  return count ?? 0;
}

async function assertNoActiveConflict(
  supabase: SupabaseClient,
  equipmentId: string,
  exceptLinkId?: string,
) {
  let query = supabase
    .from('master_topography_operation_equipment')
    .select('id, operation_id')
    .eq('equipment_id', equipmentId)
    .is('returned_at', null)
    .limit(5);

  if (exceptLinkId) query = query.neq('id', exceptLinkId);

  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Falha ao verificar conflito de reserva.');
  if (data && data.length > 0) {
    throw new Error(
      'Equipamento já reservado ou em uso em outra Ordem de Serviço. Finalize a devolução antes.',
    );
  }
}

export async function reserveOperationEquipment(
  supabase: SupabaseClient,
  operationId: string,
  input: MasterTopographyOperationEquipmentInput,
  createdBy: string | null,
): Promise<MasterTopographyOperationEquipmentLink> {
  const equipment = await getTopographyEquipmentById(supabase, input.equipment_id);
  if (!equipment) throw new Error('Equipamento não encontrado.');
  if (equipment.is_archived) throw new Error('Equipamento arquivado não pode ser vinculado.');
  if (['DECOMMISSIONED', 'MAINTENANCE', 'CALIBRATION'].includes(equipment.status)) {
    throw new Error(`Equipamento com status ${equipment.status} não pode ser reservado.`);
  }

  await assertNoActiveConflict(supabase, input.equipment_id);

  const now = new Date().toISOString();
  const previous = equipment.status;

  const { data, error } = await supabase
    .from('master_topography_operation_equipment')
    .insert({
      operation_id: operationId,
      equipment_id: input.equipment_id,
      reserved_at: now,
      previous_equipment_status: previous,
      notes: input.notes ?? null,
      created_by: createdBy,
      updated_at: now,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) throw new Error(error.message || 'Falha ao reservar equipamento.');

  if (equipment.status === 'AVAILABLE') {
    await patchTopographyEquipmentFields(supabase, input.equipment_id, {
      status: 'RESERVED',
    });
  }

  const link = parseRow(data as unknown as Record<string, unknown>);
  link.equipment_code = equipment.code;
  link.equipment_name = equipment.name;
  link.equipment_status = 'RESERVED';

  await logTopographyOperationAudit(supabase, {
    userId: createdBy,
    action: 'TOPOGRAPHY_OPERATION_EQUIPMENT_RESERVED',
    entityId: operationId,
    description: `Equipamento reservado: ${equipment.code}`,
    newData: { link_id: link.id, equipment_id: equipment.id },
  });

  await logTopographyEquipmentAudit(supabase, {
    userId: createdBy,
    action: 'TOPOGRAPHY_EQUIPMENT_RESERVED_FOR_OPERATION',
    entityId: equipment.id,
    description: `Reservado para OS [${operationId}]`,
    newData: { operation_id: operationId, link_id: link.id },
  });

  return link;
}

export async function checkoutOperationEquipment(
  supabase: SupabaseClient,
  operationId: string,
  linkId: string,
  opts: { condition_out?: string | null; userId: string | null },
): Promise<MasterTopographyOperationEquipmentLink> {
  const { data: existing, error: loadErr } = await supabase
    .from('master_topography_operation_equipment')
    .select(SELECT_COLUMNS)
    .eq('id', linkId)
    .eq('operation_id', operationId)
    .maybeSingle();
  if (loadErr) throw new Error(loadErr.message);
  if (!existing) throw new Error('Vínculo de equipamento não encontrado.');
  const row = parseRow(existing as unknown as Record<string, unknown>);
  if (row.returned_at) throw new Error('Equipamento já devolvido.');
  if (row.checked_out_at) throw new Error('Equipamento já retirado.');

  const equipment = await getTopographyEquipmentById(supabase, row.equipment_id);
  if (!equipment) throw new Error('Equipamento não encontrado.');

  const now = new Date().toISOString();
  const previous = row.previous_equipment_status || equipment.status;

  const { data, error } = await supabase
    .from('master_topography_operation_equipment')
    .update({
      checked_out_at: now,
      condition_out: opts.condition_out ?? null,
      previous_equipment_status: previous,
      updated_at: now,
    })
    .eq('id', linkId)
    .select(SELECT_COLUMNS)
    .single();

  if (error) throw new Error(error.message || 'Falha ao registrar retirada.');

  await patchTopographyEquipmentFields(supabase, row.equipment_id, { status: 'IN_USE' });

  const link = parseRow(data as unknown as Record<string, unknown>);
  await logTopographyOperationAudit(supabase, {
    userId: opts.userId,
    action: 'TOPOGRAPHY_OPERATION_EQUIPMENT_CHECKED_OUT',
    entityId: operationId,
    description: `Equipamento retirado: ${equipment.code}`,
    newData: { link_id: linkId },
  });

  await logTopographyEquipmentAudit(supabase, {
    userId: opts.userId,
    action: 'TOPOGRAPHY_EQUIPMENT_CHECKED_OUT',
    entityId: equipment.id,
    description: `Retirado para OS [${operationId}]`,
    newData: { operation_id: operationId, status: 'IN_USE' },
  });

  return link;
}

export async function returnOperationEquipment(
  supabase: SupabaseClient,
  operationId: string,
  linkId: string,
  opts: { condition_return?: string | null; notes?: string | null; userId: string | null },
): Promise<MasterTopographyOperationEquipmentLink> {
  const { data: existing, error: loadErr } = await supabase
    .from('master_topography_operation_equipment')
    .select(SELECT_COLUMNS)
    .eq('id', linkId)
    .eq('operation_id', operationId)
    .maybeSingle();
  if (loadErr) throw new Error(loadErr.message);
  if (!existing) throw new Error('Vínculo de equipamento não encontrado.');
  const row = parseRow(existing as unknown as Record<string, unknown>);
  if (row.returned_at) throw new Error('Equipamento já devolvido.');

  const equipment = await getTopographyEquipmentById(supabase, row.equipment_id);
  if (!equipment) throw new Error('Equipamento não encontrado.');

  const now = new Date().toISOString();
  const restoreStatus = row.previous_equipment_status || 'AVAILABLE';

  const { data, error } = await supabase
    .from('master_topography_operation_equipment')
    .update({
      returned_at: now,
      condition_return: opts.condition_return ?? null,
      notes: opts.notes ?? row.notes,
      updated_at: now,
    })
    .eq('id', linkId)
    .select(SELECT_COLUMNS)
    .single();

  if (error) throw new Error(error.message || 'Falha ao registrar devolução.');

  if (equipment.status === 'IN_USE' || equipment.status === 'RESERVED') {
    await patchTopographyEquipmentFields(supabase, row.equipment_id, {
      status: restoreStatus === 'RESERVED' ? 'AVAILABLE' : restoreStatus,
    });
  }

  const link = parseRow(data as unknown as Record<string, unknown>);
  await logTopographyOperationAudit(supabase, {
    userId: opts.userId,
    action: 'TOPOGRAPHY_OPERATION_EQUIPMENT_RETURNED',
    entityId: operationId,
    description: `Equipamento devolvido: ${equipment.code}`,
    newData: { link_id: linkId, restored_status: restoreStatus },
  });

  await logTopographyEquipmentAudit(supabase, {
    userId: opts.userId,
    action: 'TOPOGRAPHY_EQUIPMENT_RETURNED_FROM_OPERATION',
    entityId: equipment.id,
    description: `Devolvido da OS [${operationId}]`,
    newData: { operation_id: operationId },
  });

  return link;
}
