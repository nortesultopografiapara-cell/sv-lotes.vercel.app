import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  MasterTopographyEquipmentAssignment,
  MasterTopographyEquipmentTransferInput,
} from './equipmentAssignmentTypes';
import {
  getTopographyEquipmentById,
  logTopographyEquipmentAudit,
  patchTopographyEquipmentFields,
} from './equipmentService';

const SELECT_COLUMNS = `
  id, equipment_id, from_responsible_user_id, from_responsible_name,
  to_responsible_user_id, to_responsible_name, from_location, to_location,
  project_id, moved_at, reason, notes, created_by, created_at
`
  .replace(/\s+/g, ' ')
  .trim();

function parseRow(row: Record<string, unknown>): MasterTopographyEquipmentAssignment {
  return {
    id: String(row.id),
    equipment_id: String(row.equipment_id),
    from_responsible_user_id: row.from_responsible_user_id
      ? String(row.from_responsible_user_id)
      : null,
    from_responsible_name: row.from_responsible_name
      ? String(row.from_responsible_name)
      : null,
    to_responsible_user_id: row.to_responsible_user_id
      ? String(row.to_responsible_user_id)
      : null,
    to_responsible_name: row.to_responsible_name ? String(row.to_responsible_name) : null,
    from_location: row.from_location ? String(row.from_location) : null,
    to_location: row.to_location ? String(row.to_location) : null,
    project_id: row.project_id ? String(row.project_id) : null,
    moved_at: String(row.moved_at || ''),
    reason: row.reason ? String(row.reason) : null,
    notes: row.notes ? String(row.notes) : null,
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at || ''),
  };
}

export async function listEquipmentAssignments(
  supabase: SupabaseClient,
  equipmentId: string,
): Promise<MasterTopographyEquipmentAssignment[]> {
  const { data, error } = await supabase
    .from('master_topography_equipment_assignments')
    .select(SELECT_COLUMNS)
    .eq('equipment_id', equipmentId)
    .order('moved_at', { ascending: false });

  if (error) throw new Error(error.message || 'Falha ao listar movimentações.');
  return (data || []).map((row) => parseRow(row as unknown as Record<string, unknown>));
}

/**
 * Registra histórico e atualiza responsável/localização do equipamento.
 * Não apaga movimentações anteriores (append-only).
 */
export async function transferEquipmentAssignment(
  supabase: SupabaseClient,
  params: {
    equipmentId: string;
    input: MasterTopographyEquipmentTransferInput;
    createdBy: string | null;
  },
): Promise<{
  assignment: MasterTopographyEquipmentAssignment;
  equipment: NonNullable<Awaited<ReturnType<typeof getTopographyEquipmentById>>>;
}> {
  const equipment = await getTopographyEquipmentById(supabase, params.equipmentId);
  if (!equipment) throw new Error('Equipamento não encontrado.');

  const toResponsibleUserId =
    params.input.to_responsible_user_id !== undefined
      ? params.input.to_responsible_user_id
      : equipment.responsible_user_id;
  const toResponsibleName =
    params.input.to_responsible_name !== undefined
      ? params.input.to_responsible_name
      : equipment.responsible_name;
  const toLocation =
    params.input.to_location !== undefined
      ? params.input.to_location
      : equipment.location;

  const movedAt = params.input.moved_at || new Date().toISOString();

  const { data, error } = await supabase
    .from('master_topography_equipment_assignments')
    .insert({
      equipment_id: params.equipmentId,
      from_responsible_user_id: equipment.responsible_user_id,
      from_responsible_name: equipment.responsible_name,
      to_responsible_user_id: toResponsibleUserId,
      to_responsible_name: toResponsibleName,
      from_location: equipment.location,
      to_location: toLocation,
      project_id: params.input.project_id ?? null,
      moved_at: movedAt,
      reason: params.input.reason ?? null,
      notes: params.input.notes ?? null,
      created_by: params.createdBy,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) throw new Error(error.message || 'Falha ao registrar movimentação.');

  const assignment = parseRow(data as unknown as Record<string, unknown>);

  const updated = await patchTopographyEquipmentFields(supabase, params.equipmentId, {
    responsible_user_id: toResponsibleUserId,
    responsible_name: toResponsibleName,
    location: toLocation,
  });

  await logTopographyEquipmentAudit(supabase, {
    userId: params.createdBy,
    action: 'TOPOGRAPHY_EQUIPMENT_ASSIGNED',
    entityId: params.equipmentId,
    description: `Movimentação ${equipment.code}: ${equipment.responsible_name || '—'} → ${toResponsibleName || '—'}`,
    oldData: {
      responsible_name: equipment.responsible_name,
      location: equipment.location,
    },
    newData: {
      assignment_id: assignment.id,
      responsible_name: toResponsibleName,
      location: toLocation,
      reason: params.input.reason,
    },
  });

  return { assignment, equipment: updated };
}

/**
 * Gera assignment automático quando o form edita responsável/localização.
 */
export async function recordAssignmentFromEquipmentEdit(
  supabase: SupabaseClient,
  params: {
    equipmentId: string;
    before: {
      responsible_user_id: string | null;
      responsible_name: string | null;
      location: string | null;
    };
    after: {
      responsible_user_id: string | null;
      responsible_name: string | null;
      location: string | null;
    };
    createdBy: string | null;
  },
): Promise<MasterTopographyEquipmentAssignment | null> {
  const changed =
    params.before.responsible_user_id !== params.after.responsible_user_id ||
    params.before.responsible_name !== params.after.responsible_name ||
    params.before.location !== params.after.location;

  if (!changed) return null;

  const { data, error } = await supabase
    .from('master_topography_equipment_assignments')
    .insert({
      equipment_id: params.equipmentId,
      from_responsible_user_id: params.before.responsible_user_id,
      from_responsible_name: params.before.responsible_name,
      to_responsible_user_id: params.after.responsible_user_id,
      to_responsible_name: params.after.responsible_name,
      from_location: params.before.location,
      to_location: params.after.location,
      moved_at: new Date().toISOString(),
      reason: 'EDIT_FORM',
      notes: null,
      created_by: params.createdBy,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    // não bloqueia edição do equipamento
    return null;
  }

  return parseRow(data as unknown as Record<string, unknown>);
}
