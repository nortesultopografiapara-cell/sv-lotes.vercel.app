/**
 * Conciliação operacional Asaas Corporativo (Fase 7.5).
 * Localiza cobranças ativas/pagas remotas sem pagamento local e materializa de forma idempotente.
 * Sem importação bancária genérica.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logCorporateFinanceAudit } from '../service';
import {
  getCorporateAsaasChargeById,
  listCorporateAsaasCharges,
  syncCorporateAsaasCharge,
} from './chargesService';
import { isCorporateAsaasPaidStatus, type MasterCorporateAsaasCharge } from './types';

export type CorporateAsaasReconcileResult = {
  scanned: number;
  synced: number;
  settled: number;
  alreadySettled: number;
  failed: number;
  items: Array<{
    charge_id: string;
    asaas_payment_id: string;
    result: 'SYNCED' | 'SETTLED' | 'ALREADY_SETTLED' | 'FAILED';
    message?: string;
  }>;
};

/**
 * Concilia cobranças corporativas:
 * - se chargeId informado: sync+settle dessa cobrança
 * - senão: varre cobranças não arquivadas sem receivable_payment_id e sincroniza
 */
export async function reconcileCorporateAsaasCharges(
  supabase: SupabaseClient,
  opts: {
    chargeId?: string | null;
    receivableId?: string | null;
    limit?: number;
    userId: string | null;
    dryRun?: boolean;
  },
): Promise<CorporateAsaasReconcileResult> {
  const result: CorporateAsaasReconcileResult = {
    scanned: 0,
    synced: 0,
    settled: 0,
    alreadySettled: 0,
    failed: 0,
    items: [],
  };

  let targets: MasterCorporateAsaasCharge[] = [];

  if (opts.chargeId) {
    const one = await getCorporateAsaasChargeById(supabase, opts.chargeId);
    if (!one) throw new Error('Cobrança não encontrada.');
    targets = [one];
  } else {
    const listed = await listCorporateAsaasCharges(supabase, {
      receivableId: opts.receivableId || undefined,
      includeArchived: false,
      page: 1,
      limit: Math.min(100, Math.max(1, opts.limit || 50)),
    });
    targets = listed.charges.filter((c) => !c.receivable_payment_id);
  }

  result.scanned = targets.length;

  for (const charge of targets) {
    if (opts.dryRun) {
      result.items.push({
        charge_id: charge.id,
        asaas_payment_id: charge.asaas_payment_id,
        result: 'SYNCED',
        message: 'dry-run — sync não executado',
      });
      continue;
    }

    try {
      const beforePaid = isCorporateAsaasPaidStatus(charge.local_status);
      const beforePaymentId = charge.receivable_payment_id;
      const updated = await syncCorporateAsaasCharge(supabase, charge.id, opts.userId);
      result.synced += 1;

      if (updated.receivable_payment_id && !beforePaymentId) {
        result.settled += 1;
        result.items.push({
          charge_id: updated.id,
          asaas_payment_id: updated.asaas_payment_id,
          result: 'SETTLED',
        });
      } else if (updated.receivable_payment_id) {
        result.alreadySettled += 1;
        result.items.push({
          charge_id: updated.id,
          asaas_payment_id: updated.asaas_payment_id,
          result: 'ALREADY_SETTLED',
        });
      } else {
        result.items.push({
          charge_id: updated.id,
          asaas_payment_id: updated.asaas_payment_id,
          result: 'SYNCED',
          message: beforePaid
            ? `Status ${updated.local_status} sem pagamento materializado`
            : `Status remoto ${updated.local_status}`,
        });
      }
    } catch (err) {
      result.failed += 1;
      result.items.push({
        charge_id: charge.id,
        asaas_payment_id: charge.asaas_payment_id,
        result: 'FAILED',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await logCorporateFinanceAudit(supabase, {
    userId: opts.userId,
    action: 'CORPORATE_ASAAS_RECONCILE',
    entityId: opts.chargeId || opts.receivableId || null,
    description: `Conciliação Asaas: scanned=${result.scanned} settled=${result.settled} failed=${result.failed}`,
    newData: {
      dryRun: Boolean(opts.dryRun),
      scanned: result.scanned,
      settled: result.settled,
      failed: result.failed,
    },
  });

  return result;
}
