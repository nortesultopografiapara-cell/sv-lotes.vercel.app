import type { SupabaseClient } from '@supabase/supabase-js';
import { OPERATION_CHECKLIST_TEMPLATES } from './operationChecklistTemplates';
import type {
  ChecklistTemplateCode,
  MasterTopographyOperationTask,
  MasterTopographyOperationTaskInput,
  OperationTaskStatus,
} from './operationTaskTypes';
import { logTopographyOperationAudit } from './operationService';

const SELECT_COLUMNS = `
  id, operation_id, title, description, is_required, is_critical, status,
  order_index, completed_at, completed_by, notes, created_at, updated_at
`
  .replace(/\s+/g, ' ')
  .trim();

function parseRow(row: Record<string, unknown>): MasterTopographyOperationTask {
  return {
    id: String(row.id),
    operation_id: String(row.operation_id),
    title: String(row.title || ''),
    description: row.description ? String(row.description) : null,
    is_required: Boolean(row.is_required),
    is_critical: Boolean(row.is_critical),
    status: row.status as OperationTaskStatus,
    order_index: Number(row.order_index || 0),
    completed_at: row.completed_at ? String(row.completed_at) : null,
    completed_by: row.completed_by ? String(row.completed_by) : null,
    notes: row.notes ? String(row.notes) : null,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  };
}

export async function listOperationTasks(
  supabase: SupabaseClient,
  operationId: string,
): Promise<MasterTopographyOperationTask[]> {
  const { data, error } = await supabase
    .from('master_topography_operation_tasks')
    .select(SELECT_COLUMNS)
    .eq('operation_id', operationId)
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message || 'Falha ao listar checklist.');
  return (data || []).map((r) => parseRow(r as unknown as Record<string, unknown>));
}

export async function countPendingCriticalRequiredTasks(
  supabase: SupabaseClient,
  operationId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('master_topography_operation_tasks')
    .select('id, status, is_required, is_critical')
    .eq('operation_id', operationId)
    .eq('is_required', true)
    .eq('is_critical', true);
  if (error) throw new Error(error.message || 'Falha ao verificar checklist crítico.');
  return (data || []).filter(
    (t) => t.status !== 'COMPLETED' && t.status !== 'SKIPPED',
  ).length;
}

export async function countPendingTasks(
  supabase: SupabaseClient,
  operationId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('master_topography_operation_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('operation_id', operationId)
    .in('status', ['PENDING', 'IN_PROGRESS']);
  if (error) throw new Error(error.message || 'Falha ao contar checklist pendente.');
  return count ?? 0;
}

export async function createOperationTask(
  supabase: SupabaseClient,
  operationId: string,
  input: MasterTopographyOperationTaskInput,
  userId: string | null,
): Promise<MasterTopographyOperationTask> {
  const { data, error } = await supabase
    .from('master_topography_operation_tasks')
    .insert({
      operation_id: operationId,
      title: input.title,
      description: input.description ?? null,
      is_required: Boolean(input.is_required),
      is_critical: Boolean(input.is_critical),
      status: input.status ?? 'PENDING',
      order_index: input.order_index ?? 0,
      notes: input.notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw new Error(error.message || 'Falha ao criar item.');
  const task = parseRow(data as unknown as Record<string, unknown>);
  await logTopographyOperationAudit(supabase, {
    userId,
    action: 'TOPOGRAPHY_OPERATION_TASK_CREATED',
    entityId: operationId,
    description: `Checklist: ${task.title}`,
    newData: { task_id: task.id },
  });
  return task;
}

export async function updateOperationTask(
  supabase: SupabaseClient,
  operationId: string,
  taskId: string,
  input: MasterTopographyOperationTaskInput,
  userId: string | null,
): Promise<MasterTopographyOperationTask> {
  const now = new Date().toISOString();
  const status = input.status ?? 'PENDING';
  const completed =
    status === 'COMPLETED' || status === 'SKIPPED'
      ? { completed_at: now, completed_by: userId }
      : { completed_at: null, completed_by: null };

  const { data, error } = await supabase
    .from('master_topography_operation_tasks')
    .update({
      title: input.title,
      description: input.description ?? null,
      is_required: Boolean(input.is_required),
      is_critical: Boolean(input.is_critical),
      status,
      order_index: input.order_index ?? 0,
      notes: input.notes ?? null,
      ...completed,
      updated_at: now,
    })
    .eq('id', taskId)
    .eq('operation_id', operationId)
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw new Error(error.message || 'Falha ao atualizar item.');
  const task = parseRow(data as unknown as Record<string, unknown>);
  await logTopographyOperationAudit(supabase, {
    userId,
    action:
      status === 'COMPLETED'
        ? 'TOPOGRAPHY_OPERATION_TASK_COMPLETED'
        : 'TOPOGRAPHY_OPERATION_TASK_UPDATED',
    entityId: operationId,
    description: `Checklist ${status}: ${task.title}`,
    newData: { task_id: task.id, status },
  });
  return task;
}

export async function reorderOperationTasks(
  supabase: SupabaseClient,
  operationId: string,
  orderedIds: string[],
): Promise<void> {
  for (let i = 0; i < orderedIds.length; i += 1) {
    const { error } = await supabase
      .from('master_topography_operation_tasks')
      .update({ order_index: i, updated_at: new Date().toISOString() })
      .eq('id', orderedIds[i])
      .eq('operation_id', operationId);
    if (error) throw new Error(error.message || 'Falha ao reordenar checklist.');
  }
}

export async function applyChecklistTemplate(
  supabase: SupabaseClient,
  operationId: string,
  template: ChecklistTemplateCode,
  userId: string | null,
): Promise<MasterTopographyOperationTask[]> {
  const tpl = OPERATION_CHECKLIST_TEMPLATES[template];
  if (!tpl) throw new Error('Template inválido.');

  const existing = await listOperationTasks(supabase, operationId);
  const startIndex = existing.length;
  const created: MasterTopographyOperationTask[] = [];

  for (let i = 0; i < tpl.items.length; i += 1) {
    const item = tpl.items[i];
    const task = await createOperationTask(
      supabase,
      operationId,
      {
        title: item.title,
        is_required: item.is_required,
        is_critical: item.is_critical,
        order_index: startIndex + i,
        status: 'PENDING',
      },
      userId,
    );
    created.push(task);
  }

  await logTopographyOperationAudit(supabase, {
    userId,
    action: 'TOPOGRAPHY_OPERATION_CHECKLIST_TEMPLATE_APPLIED',
    entityId: operationId,
    description: `Template aplicado: ${tpl.label}`,
    newData: { template, count: created.length },
  });

  return created;
}

export async function deleteOperationTask(
  supabase: SupabaseClient,
  operationId: string,
  taskId: string,
  userId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('master_topography_operation_tasks')
    .delete()
    .eq('id', taskId)
    .eq('operation_id', operationId);
  if (error) throw new Error(error.message || 'Falha ao excluir item.');
  await logTopographyOperationAudit(supabase, {
    userId,
    action: 'TOPOGRAPHY_OPERATION_TASK_DELETED',
    entityId: operationId,
    description: `Checklist item removido`,
    newData: { task_id: taskId },
  });
}
