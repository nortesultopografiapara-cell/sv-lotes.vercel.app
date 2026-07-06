/**
 * Execução linha a linha — atualização de parcelas.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildInstallmentUpdatePayload,
} from '@/lib/imports/modules/installments/validateRows';
import type { ValidatedInstallmentRow } from '@/lib/imports/modules/installments/types';

export type ExecuteInstallmentRowResult =
  | { ok: true }
  | { ok: false; error: string };

export async function executeImportableInstallmentRow(params: {
  admin: SupabaseClient;
  tenantId: string;
  row: ValidatedInstallmentRow;
}): Promise<ExecuteInstallmentRowResult> {
  const { admin, tenantId, row } = params;

  if (!row.receipt_id || !row.importable) {
    return { ok: false, error: 'Parcela não localizada ou inválida.' };
  }

  const update = buildInstallmentUpdatePayload(row);
  if (Object.keys(update).length === 0) {
    return { ok: false, error: 'Nenhum campo para atualizar.' };
  }

  const byTenant = await admin
    .from('finance_receipts')
    .update(update)
    .eq('id', row.receipt_id)
    .eq('tenant_id', tenantId);

  if (!byTenant.error) return { ok: true };

  const byCompany = await admin
    .from('finance_receipts')
    .update(update)
    .eq('id', row.receipt_id)
    .eq('company_id', tenantId);

  if (byCompany.error) {
    return { ok: false, error: byCompany.error.message };
  }

  return { ok: true };
}
