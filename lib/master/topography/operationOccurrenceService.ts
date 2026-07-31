import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  MasterTopographyOperationOccurrence,
  MasterTopographyOperationOccurrenceInput,
  OperationOccurrenceSeverity,
  OperationOccurrenceStatus,
  OperationOccurrenceType,
} from './operationOccurrenceTypes';
import { logTopographyOperationAudit } from './operationService';

const SELECT_COLUMNS = `
  id, operation_id, type, severity, title, description, occurred_at, action_taken,
  status, resolved_at, resolved_by, evidence_document_id, created_by, created_at, updated_at
`
  .replace(/\s+/g, ' ')
  .trim();

function parseRow(row: Record<string, unknown>): MasterTopographyOperationOccurrence {
  return {
    id: String(row.id),
    operation_id: String(row.operation_id),
    type: row.type as OperationOccurrenceType,
    severity: row.severity as OperationOccurrenceSeverity,
    title: String(row.title || ''),
    description: row.description ? String(row.description) : null,
    occurred_at: String(row.occurred_at || ''),
    action_taken: row.action_taken ? String(row.action_taken) : null,
    status: row.status as OperationOccurrenceStatus,
    resolved_at: row.resolved_at ? String(row.resolved_at) : null,
    resolved_by: row.resolved_by ? String(row.resolved_by) : null,
    evidence_document_id: row.evidence_document_id ? String(row.evidence_document_id) : null,
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  };
}

export async function listOperationOccurrences(
  supabase: SupabaseClient,
  operationId: string,
): Promise<MasterTopographyOperationOccurrence[]> {
  const { data, error } = await supabase
    .from('master_topography_operation_occurrences')
    .select(SELECT_COLUMNS)
    .eq('operation_id', operationId)
    .order('occurred_at', { ascending: false });
  if (error) throw new Error(error.message || 'Falha ao listar ocorrências.');
  return (data || []).map((r) => parseRow(r as unknown as Record<string, unknown>));
}

export async function countOpenOccurrences(
  supabase: SupabaseClient,
  operationId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('master_topography_operation_occurrences')
    .select('id', { count: 'exact', head: true })
    .eq('operation_id', operationId)
    .in('status', ['OPEN', 'IN_ANALYSIS']);
  if (error) throw new Error(error.message || 'Falha ao contar ocorrências.');
  return count ?? 0;
}

export async function countOpenCriticalOccurrences(
  supabase: SupabaseClient,
  operationId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('master_topography_operation_occurrences')
    .select('id', { count: 'exact', head: true })
    .eq('operation_id', operationId)
    .eq('severity', 'CRITICAL')
    .in('status', ['OPEN', 'IN_ANALYSIS']);
  if (error) throw new Error(error.message || 'Falha ao contar ocorrências críticas.');
  return count ?? 0;
}

export async function createOperationOccurrence(
  supabase: SupabaseClient,
  operationId: string,
  input: MasterTopographyOperationOccurrenceInput,
  createdBy: string | null,
): Promise<MasterTopographyOperationOccurrence> {
  const { data, error } = await supabase
    .from('master_topography_operation_occurrences')
    .insert({
      operation_id: operationId,
      type: input.type,
      severity: input.severity,
      title: input.title,
      description: input.description ?? null,
      occurred_at: input.occurred_at ?? new Date().toISOString(),
      action_taken: input.action_taken ?? null,
      status: input.status ?? 'OPEN',
      evidence_document_id: input.evidence_document_id ?? null,
      created_by: createdBy,
      updated_at: new Date().toISOString(),
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw new Error(error.message || 'Falha ao registrar ocorrência.');
  const occ = parseRow(data as unknown as Record<string, unknown>);
  await logTopographyOperationAudit(supabase, {
    userId: createdBy,
    action: 'TOPOGRAPHY_OPERATION_OCCURRENCE_CREATED',
    entityId: operationId,
    description: `Ocorrência: ${occ.title}`,
    newData: { occurrence_id: occ.id, severity: occ.severity },
  });
  return occ;
}

export async function updateOperationOccurrence(
  supabase: SupabaseClient,
  operationId: string,
  occurrenceId: string,
  input: MasterTopographyOperationOccurrenceInput,
  userId: string | null,
): Promise<MasterTopographyOperationOccurrence> {
  const now = new Date().toISOString();
  const status = input.status ?? 'OPEN';
  const resolved =
    status === 'RESOLVED'
      ? { resolved_at: now, resolved_by: userId }
      : status === 'CANCELED'
        ? { resolved_at: now, resolved_by: userId }
        : { resolved_at: null, resolved_by: null };

  const { data, error } = await supabase
    .from('master_topography_operation_occurrences')
    .update({
      type: input.type,
      severity: input.severity,
      title: input.title,
      description: input.description ?? null,
      occurred_at: input.occurred_at ?? now,
      action_taken: input.action_taken ?? null,
      status,
      evidence_document_id: input.evidence_document_id ?? null,
      ...resolved,
      updated_at: now,
    })
    .eq('id', occurrenceId)
    .eq('operation_id', operationId)
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw new Error(error.message || 'Falha ao atualizar ocorrência.');
  const occ = parseRow(data as unknown as Record<string, unknown>);
  await logTopographyOperationAudit(supabase, {
    userId,
    action:
      status === 'RESOLVED'
        ? 'TOPOGRAPHY_OPERATION_OCCURRENCE_RESOLVED'
        : 'TOPOGRAPHY_OPERATION_OCCURRENCE_UPDATED',
    entityId: operationId,
    description: `Ocorrência ${status}: ${occ.title}`,
    newData: { occurrence_id: occ.id },
  });
  return occ;
}
