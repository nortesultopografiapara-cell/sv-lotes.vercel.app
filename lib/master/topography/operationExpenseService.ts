import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  MasterTopographyOperationExpense,
  MasterTopographyOperationExpenseInput,
  OperationExpenseCategory,
} from './operationExpenseTypes';
import { logTopographyOperationAudit, patchTopographyOperationFields } from './operationService';

const SELECT_COLUMNS = `
  id, operation_id, category, description, amount, expense_date, supplier,
  payment_method, receipt_document_id, payable_id, notes, is_archived,
  created_by, created_at, updated_at
`
  .replace(/\s+/g, ' ')
  .trim();

function parseRow(row: Record<string, unknown>): MasterTopographyOperationExpense {
  return {
    id: String(row.id),
    operation_id: String(row.operation_id),
    category: row.category as OperationExpenseCategory,
    description: String(row.description || ''),
    amount: Number(row.amount || 0),
    expense_date: String(row.expense_date || '').slice(0, 10),
    supplier: row.supplier ? String(row.supplier) : null,
    payment_method: row.payment_method ? String(row.payment_method) : null,
    receipt_document_id: row.receipt_document_id ? String(row.receipt_document_id) : null,
    payable_id: row.payable_id ? String(row.payable_id) : null,
    notes: row.notes ? String(row.notes) : null,
    is_archived: Boolean(row.is_archived),
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  };
}

export async function listOperationExpenses(
  supabase: SupabaseClient,
  operationId: string,
  opts?: { includeArchived?: boolean },
): Promise<MasterTopographyOperationExpense[]> {
  let query = supabase
    .from('master_topography_operation_expenses')
    .select(SELECT_COLUMNS)
    .eq('operation_id', operationId)
    .order('expense_date', { ascending: false });
  if (!opts?.includeArchived) query = query.eq('is_archived', false);
  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Falha ao listar despesas.');
  return (data || []).map((r) => parseRow(r as unknown as Record<string, unknown>));
}

export async function syncOperationActualCostFromExpenses(
  supabase: SupabaseClient,
  operationId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('master_topography_operation_expenses')
    .select('amount')
    .eq('operation_id', operationId)
    .eq('is_archived', false);
  if (error) throw new Error(error.message || 'Falha ao somar despesas.');
  const sum = Math.round(
    (data || []).reduce((acc, r) => acc + Number(r.amount || 0), 0) * 100,
  ) / 100;
  await patchTopographyOperationFields(supabase, operationId, { actual_cost: sum });
  return sum;
}

export async function createOperationExpense(
  supabase: SupabaseClient,
  operationId: string,
  input: MasterTopographyOperationExpenseInput,
  createdBy: string | null,
): Promise<MasterTopographyOperationExpense> {
  const { data, error } = await supabase
    .from('master_topography_operation_expenses')
    .insert({
      operation_id: operationId,
      category: input.category,
      description: input.description,
      amount: input.amount,
      expense_date: input.expense_date,
      supplier: input.supplier ?? null,
      payment_method: input.payment_method ?? null,
      receipt_document_id: input.receipt_document_id ?? null,
      notes: input.notes ?? null,
      created_by: createdBy,
      updated_at: new Date().toISOString(),
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw new Error(error.message || 'Falha ao criar despesa.');
  const expense = parseRow(data as unknown as Record<string, unknown>);
  await syncOperationActualCostFromExpenses(supabase, operationId);
  await logTopographyOperationAudit(supabase, {
    userId: createdBy,
    action: 'TOPOGRAPHY_OPERATION_EXPENSE_CREATED',
    entityId: operationId,
    description: `Despesa: ${expense.description} (${expense.amount})`,
    newData: { expense_id: expense.id },
  });
  return expense;
}

export async function updateOperationExpense(
  supabase: SupabaseClient,
  operationId: string,
  expenseId: string,
  input: MasterTopographyOperationExpenseInput,
  userId: string | null,
): Promise<MasterTopographyOperationExpense> {
  const { data, error } = await supabase
    .from('master_topography_operation_expenses')
    .update({
      category: input.category,
      description: input.description,
      amount: input.amount,
      expense_date: input.expense_date,
      supplier: input.supplier ?? null,
      payment_method: input.payment_method ?? null,
      receipt_document_id: input.receipt_document_id ?? null,
      notes: input.notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', expenseId)
    .eq('operation_id', operationId)
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw new Error(error.message || 'Falha ao atualizar despesa.');
  const expense = parseRow(data as unknown as Record<string, unknown>);
  await syncOperationActualCostFromExpenses(supabase, operationId);
  await logTopographyOperationAudit(supabase, {
    userId,
    action: 'TOPOGRAPHY_OPERATION_EXPENSE_UPDATED',
    entityId: operationId,
    description: `Despesa atualizada: ${expense.description}`,
    newData: { expense_id: expense.id },
  });
  return expense;
}

export async function archiveOperationExpense(
  supabase: SupabaseClient,
  operationId: string,
  expenseId: string,
  userId: string | null,
): Promise<MasterTopographyOperationExpense> {
  const { data, error } = await supabase
    .from('master_topography_operation_expenses')
    .update({ is_archived: true, updated_at: new Date().toISOString() })
    .eq('id', expenseId)
    .eq('operation_id', operationId)
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw new Error(error.message || 'Falha ao arquivar despesa.');
  const expense = parseRow(data as unknown as Record<string, unknown>);
  await syncOperationActualCostFromExpenses(supabase, operationId);
  await logTopographyOperationAudit(supabase, {
    userId,
    action: 'TOPOGRAPHY_OPERATION_EXPENSE_ARCHIVED',
    entityId: operationId,
    description: `Despesa arquivada: ${expense.description}`,
    newData: { expense_id: expense.id },
  });
  return expense;
}
