/**
 * Emissão C6 em lote. O motor individual já existe.
 * A constante permanece falsa até a aprovação do primeiro boleto real.
 */

import { emitC6InstallmentBoleto } from '@/lib/banking/c6/c6InstallmentCharge';
import type { SupabaseClient } from '@supabase/supabase-js';

export const C6_BOLEPIX_V2_BATCH_ENABLED = false;

export function c6PendingBoletoBatchRefusal(): string {
  return 'Emissão C6 em lote permanece bloqueada. Use o botão da parcela autorizada.';
}

/** Parcelas ainda sem boleto. Não emite. */
export function planC6PendingBoletoInstallments(params: {
  installmentIds: string[];
  alreadyIssuedIds: string[];
}): string[] {
  const issued = new Set(params.alreadyIssuedIds.map((id) => String(id)));
  const selected: string[] = [];
  for (const id of params.installmentIds) {
    const receiptId = String(id || '').trim();
    if (!receiptId || issued.has(receiptId) || selected.includes(receiptId)) continue;
    selected.push(receiptId);
  }
  return selected;
}

export async function emitC6PendingBoletosWhenReleased(params: {
  admin: SupabaseClient;
  companyId: string;
  installmentIds: string[];
}): Promise<{ created: number; errors: Array<{ installmentId: string; message: string }> }> {
  if (C6_BOLEPIX_V2_BATCH_ENABLED !== true) {
    throw new Error(c6PendingBoletoBatchRefusal());
  }
  let created = 0;
  const errors: Array<{ installmentId: string; message: string }> = [];
  for (const installmentId of params.installmentIds) {
    try {
      const result = await emitC6InstallmentBoleto(params.admin, params.companyId, installmentId);
      if (result.emitted || result.reused) created += 1;
    } catch (error) {
      errors.push({
        installmentId,
        message: error instanceof Error ? error.message : 'Falha ao emitir a parcela.',
      });
    }
  }
  return { created, errors };
}
