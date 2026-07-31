import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  MasterTopographyOperationTeamInput,
  MasterTopographyOperationTeamMember,
  OperationAttendanceStatus,
} from './operationTeamTypes';
import { logTopographyOperationAudit } from './operationService';

const SELECT_COLUMNS = `
  id, operation_id, user_id, name, role, phone, email, is_lead,
  planned_start, planned_end, attendance_status, notes, is_archived,
  created_by, created_at, updated_at
`
  .replace(/\s+/g, ' ')
  .trim();

function parseRow(row: Record<string, unknown>): MasterTopographyOperationTeamMember {
  return {
    id: String(row.id),
    operation_id: String(row.operation_id),
    user_id: row.user_id ? String(row.user_id) : null,
    name: String(row.name || ''),
    role: row.role ? String(row.role) : null,
    phone: row.phone ? String(row.phone) : null,
    email: row.email ? String(row.email) : null,
    is_lead: Boolean(row.is_lead),
    planned_start: row.planned_start ? String(row.planned_start) : null,
    planned_end: row.planned_end ? String(row.planned_end) : null,
    attendance_status: row.attendance_status as OperationAttendanceStatus,
    notes: row.notes ? String(row.notes) : null,
    is_archived: Boolean(row.is_archived),
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  };
}

export async function listOperationTeam(
  supabase: SupabaseClient,
  operationId: string,
  opts?: { includeArchived?: boolean },
): Promise<MasterTopographyOperationTeamMember[]> {
  let query = supabase
    .from('master_topography_operation_team')
    .select(SELECT_COLUMNS)
    .eq('operation_id', operationId)
    .order('is_lead', { ascending: false })
    .order('created_at', { ascending: true });

  if (!opts?.includeArchived) {
    query = query.eq('is_archived', false);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Falha ao listar equipe.');
  return (data || []).map((r) => parseRow(r as unknown as Record<string, unknown>));
}

export async function countActiveOperationTeam(
  supabase: SupabaseClient,
  operationId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('master_topography_operation_team')
    .select('id', { count: 'exact', head: true })
    .eq('operation_id', operationId)
    .eq('is_archived', false);
  if (error) throw new Error(error.message || 'Falha ao contar equipe.');
  return count ?? 0;
}

async function clearOtherLeads(
  supabase: SupabaseClient,
  operationId: string,
  exceptId?: string,
) {
  let query = supabase
    .from('master_topography_operation_team')
    .update({ is_lead: false, updated_at: new Date().toISOString() })
    .eq('operation_id', operationId)
    .eq('is_lead', true);
  if (exceptId) query = query.neq('id', exceptId);
  await query;
}

export async function createOperationTeamMember(
  supabase: SupabaseClient,
  operationId: string,
  input: MasterTopographyOperationTeamInput,
  createdBy: string | null,
): Promise<MasterTopographyOperationTeamMember> {
  if (input.is_lead) await clearOtherLeads(supabase, operationId);

  const { data, error } = await supabase
    .from('master_topography_operation_team')
    .insert({
      operation_id: operationId,
      user_id: input.user_id ?? null,
      name: input.name,
      role: input.role ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      is_lead: Boolean(input.is_lead),
      planned_start: input.planned_start ?? null,
      planned_end: input.planned_end ?? null,
      attendance_status: input.attendance_status ?? 'PLANNED',
      notes: input.notes ?? null,
      created_by: createdBy,
      updated_at: new Date().toISOString(),
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) throw new Error(error.message || 'Falha ao adicionar integrante.');
  const member = parseRow(data as unknown as Record<string, unknown>);

  await logTopographyOperationAudit(supabase, {
    userId: createdBy,
    action: 'TOPOGRAPHY_OPERATION_TEAM_ADDED',
    entityId: operationId,
    description: `Integrante adicionado: ${member.name}`,
    newData: { team_id: member.id, name: member.name, is_lead: member.is_lead },
  });

  return member;
}

export async function updateOperationTeamMember(
  supabase: SupabaseClient,
  operationId: string,
  memberId: string,
  input: MasterTopographyOperationTeamInput,
  userId: string | null,
): Promise<MasterTopographyOperationTeamMember> {
  if (input.is_lead) await clearOtherLeads(supabase, operationId, memberId);

  const { data, error } = await supabase
    .from('master_topography_operation_team')
    .update({
      user_id: input.user_id ?? null,
      name: input.name,
      role: input.role ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      is_lead: Boolean(input.is_lead),
      planned_start: input.planned_start ?? null,
      planned_end: input.planned_end ?? null,
      attendance_status: input.attendance_status ?? 'PLANNED',
      notes: input.notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', memberId)
    .eq('operation_id', operationId)
    .select(SELECT_COLUMNS)
    .single();

  if (error) throw new Error(error.message || 'Falha ao atualizar integrante.');
  const member = parseRow(data as unknown as Record<string, unknown>);

  await logTopographyOperationAudit(supabase, {
    userId,
    action: 'TOPOGRAPHY_OPERATION_TEAM_UPDATED',
    entityId: operationId,
    description: `Integrante atualizado: ${member.name}`,
    newData: { team_id: member.id },
  });

  return member;
}

export async function archiveOperationTeamMember(
  supabase: SupabaseClient,
  operationId: string,
  memberId: string,
  userId: string | null,
): Promise<MasterTopographyOperationTeamMember> {
  const { data, error } = await supabase
    .from('master_topography_operation_team')
    .update({ is_archived: true, is_lead: false, updated_at: new Date().toISOString() })
    .eq('id', memberId)
    .eq('operation_id', operationId)
    .select(SELECT_COLUMNS)
    .single();

  if (error) throw new Error(error.message || 'Falha ao remover integrante.');
  const member = parseRow(data as unknown as Record<string, unknown>);

  await logTopographyOperationAudit(supabase, {
    userId,
    action: 'TOPOGRAPHY_OPERATION_TEAM_REMOVED',
    entityId: operationId,
    description: `Integrante removido: ${member.name}`,
    newData: { team_id: member.id },
  });

  return member;
}
