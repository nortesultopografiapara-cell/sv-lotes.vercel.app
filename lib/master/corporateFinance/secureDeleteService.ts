/**
 * Exclusão segura e idempotente — Financeiro Corporativo Master.
 * Escopo: somente tabelas master_corporate_* (+ auditoria em audit_logs).
 * Nunca toca master_saas_*, company_*, finance_receipts tenant, GIS, contratos.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { cancelCorporateAsaasCharge } from '@/lib/master/corporateFinance/asaas/chargesService';
import { isCorporateAsaasPaidStatus } from '@/lib/master/corporateFinance/asaas/types';
import { getReceivable } from '@/lib/master/corporateFinance/receivablesService';
import { getPayable } from '@/lib/master/corporateFinance/payablesService';
import { logCorporateFinanceAudit } from '@/lib/master/corporateFinance/service';
import {
  assertSecureDeleteConfirmWord,
  corporateCashDerivedDeleteBlockMessage,
  isManualCorporateCashOrigin,
} from '@/lib/master/corporateFinance/secureDeletePolicy';

export type SecureDeleteSummary = {
  entity: 'receivable' | 'payable' | 'cash_movement' | 'asaas_charge';
  id: string;
  code: string;
  amount: number | null;
  alreadyDeleted: boolean;
  deletedPayments: number;
  deletedCashMovements: number;
  canceledAsaasCharges: number;
  archivedOrRemovedAsaasCharges: number;
  localOnlyAsaas: boolean;
  message: string;
};

function money(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

async function deleteCashMovementsByFilter(
  supabase: SupabaseClient,
  filter: { column: string; values: string[] },
): Promise<number> {
  if (!filter.values.length) return 0;

  const { data: rows, error } = await supabase
    .from('master_corporate_cash_movements')
    .select('id, reversal_movement_id')
    .in(filter.column, filter.values);
  if (error) throw new Error(error.message);

  const ids = (rows || []).map((r) => String(r.id));
  if (!ids.length) return 0;

  const { error: clearErr } = await supabase
    .from('master_corporate_cash_movements')
    .update({ reversal_movement_id: null })
    .in('id', ids);
  if (clearErr) throw new Error(clearErr.message);

  // Também limpa referências de outros movimentos que apontam para estes
  const { error: clearRevErr } = await supabase
    .from('master_corporate_cash_movements')
    .update({ reversal_movement_id: null })
    .in('reversal_movement_id', ids);
  if (clearRevErr) throw new Error(clearRevErr.message);

  // Cobranças Asaas apontando para estes movimentos
  await supabase
    .from('master_corporate_asaas_charges')
    .update({ cash_movement_id: null })
    .in('cash_movement_id', ids);

  const { error: delErr } = await supabase
    .from('master_corporate_cash_movements')
    .delete()
    .in('id', ids);
  if (delErr) throw new Error(delErr.message);

  return ids.length;
}

async function listAsaasChargesForReceivable(supabase: SupabaseClient, receivableId: string) {
  const { data, error } = await supabase
    .from('master_corporate_asaas_charges')
    .select('*')
    .eq('receivable_id', receivableId);
  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Remove vínculo local Asaas (e cancela remoto se ainda aberto).
 * Cobrança paga: nunca apaga no Asaas — só remove/arquiva localmente.
 */
async function detachAsaasChargesForReceivable(
  supabase: SupabaseClient,
  params: {
    receivableId: string;
    userId: string | null;
    localOnly: boolean;
  },
): Promise<{ canceled: number; removed: number; localOnly: boolean }> {
  const charges = await listAsaasChargesForReceivable(supabase, params.receivableId);
  let canceled = 0;
  let removed = 0;
  let usedLocalOnly = params.localOnly;

  for (const raw of charges) {
    const chargeId = String(raw.id);
    const status = String(raw.local_status || '');
    const asaasPaymentId = String(raw.asaas_payment_id || '');
    const paid = isCorporateAsaasPaidStatus(status);

    if (!paid && status !== 'CANCELLED' && status !== 'REFUNDED') {
      if (params.localOnly) {
        usedLocalOnly = true;
      } else {
        try {
          await cancelCorporateAsaasCharge(supabase, chargeId, params.userId);
          canceled += 1;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Falha ao cancelar no Asaas.';
          const e = new Error(
            `${msg} Use localOnly=true com confirmação reforçada para excluir somente o registro local.`,
          );
          (e as Error & { code?: string }).code = 'ASAAS_CANCEL_FAILED';
          throw e;
        }
      }
    }

    await logCorporateFinanceAudit(supabase, {
      userId: params.userId,
      action: paid
        ? 'CORPORATE_ASAAS_CHARGE_LOCAL_UNLINKED'
        : 'CORPORATE_ASAAS_CHARGE_LOCAL_REMOVED',
      entityId: chargeId,
      description: `Remoção local Asaas ${asaasPaymentId} (AR ${params.receivableId})`,
      oldData: {
        asaas_payment_id: asaasPaymentId,
        local_status: status,
        original_value: raw.original_value,
        paid_at: raw.paid_at,
        localOnly: usedLocalOnly,
      },
      newData: { removed: true, remoteDeleted: false },
    });

    // Webhook events: SET NULL
    await supabase
      .from('master_corporate_asaas_webhook_events')
      .update({ charge_id: null, receivable_id: null })
      .eq('charge_id', chargeId);

    const { error: delErr } = await supabase
      .from('master_corporate_asaas_charges')
      .delete()
      .eq('id', chargeId);
    if (delErr) throw new Error(delErr.message);
    removed += 1;
  }

  return { canceled, removed, localOnly: usedLocalOnly };
}

export async function deleteCorporateReceivableSecure(
  supabase: SupabaseClient,
  params: {
    id: string;
    confirmWord: string;
    userId: string | null;
    reason?: string | null;
    /** Segunda confirmação: não tenta cancelar no Asaas. */
    localOnly?: boolean;
  },
): Promise<SecureDeleteSummary> {
  assertSecureDeleteConfirmWord(params.confirmWord);

  const existing = await getReceivable(supabase, params.id);
  if (!existing) {
    return {
      entity: 'receivable',
      id: params.id,
      code: '',
      amount: null,
      alreadyDeleted: true,
      deletedPayments: 0,
      deletedCashMovements: 0,
      canceledAsaasCharges: 0,
      archivedOrRemovedAsaasCharges: 0,
      localOnlyAsaas: Boolean(params.localOnly),
      message: 'Recebível já inexistente (idempotente).',
    };
  }

  const reason = String(params.reason || 'Exclusão segura SUPER_ADMIN').slice(0, 500);

  const { data: payments, error: payErr } = await supabase
    .from('master_corporate_receivable_payments')
    .select('id, amount, is_reversed')
    .eq('receivable_id', existing.id);
  if (payErr) throw new Error(payErr.message);
  const paymentIds = (payments || []).map((p) => String(p.id));

  await logCorporateFinanceAudit(supabase, {
    userId: params.userId,
    action: 'CORPORATE_RECEIVABLE_SECURE_DELETE',
    entityId: existing.id,
    description: `Exclusão segura AR ${existing.code}`,
    oldData: {
      code: existing.code,
      status: existing.status,
      amount: existing.net_amount,
      received_amount: existing.received_amount,
      remaining_amount: existing.remaining_amount,
      reason,
      paymentIds,
    },
  });

  // Limpa ponteiro ativo antes de remover cobranças
  await supabase
    .from('master_corporate_receivables')
    .update({
      asaas_active_charge_id: null,
      asaas_integration_status: null,
      asaas_last_error: null,
      updated_at: new Date().toISOString(),
      updated_by: params.userId,
    })
    .eq('id', existing.id);

  const asaas = await detachAsaasChargesForReceivable(supabase, {
    receivableId: existing.id,
    userId: params.userId,
    localOnly: Boolean(params.localOnly),
  });

  let deletedCash = 0;
  deletedCash += await deleteCashMovementsByFilter(supabase, {
    column: 'receivable_id',
    values: [existing.id],
  });
  if (paymentIds.length) {
    deletedCash += await deleteCashMovementsByFilter(supabase, {
      column: 'receivable_payment_id',
      values: paymentIds,
    });
  }

  if (paymentIds.length) {
    const { error: delPayErr } = await supabase
      .from('master_corporate_receivable_payments')
      .delete()
      .in('id', paymentIds);
    if (delPayErr) throw new Error(delPayErr.message);
  }

  const { error: delArErr } = await supabase
    .from('master_corporate_receivables')
    .delete()
    .eq('id', existing.id);
  if (delArErr) throw new Error(delArErr.message);

  const msg = `Conta ${existing.code} excluída. ${paymentIds.length} recebimento(s) e ${deletedCash} lançamento(s) de caixa foram removidos.`;

  return {
    entity: 'receivable',
    id: existing.id,
    code: existing.code,
    amount: existing.net_amount,
    alreadyDeleted: false,
    deletedPayments: paymentIds.length,
    deletedCashMovements: deletedCash,
    canceledAsaasCharges: asaas.canceled,
    archivedOrRemovedAsaasCharges: asaas.removed,
    localOnlyAsaas: asaas.localOnly,
    message: msg,
  };
}

export async function deleteCorporatePayableSecure(
  supabase: SupabaseClient,
  params: {
    id: string;
    confirmWord: string;
    userId: string | null;
    reason?: string | null;
  },
): Promise<SecureDeleteSummary> {
  assertSecureDeleteConfirmWord(params.confirmWord);

  const existing = await getPayable(supabase, params.id);
  if (!existing) {
    return {
      entity: 'payable',
      id: params.id,
      code: '',
      amount: null,
      alreadyDeleted: true,
      deletedPayments: 0,
      deletedCashMovements: 0,
      canceledAsaasCharges: 0,
      archivedOrRemovedAsaasCharges: 0,
      localOnlyAsaas: false,
      message: 'Conta a pagar já inexistente (idempotente).',
    };
  }

  const reason = String(params.reason || 'Exclusão segura SUPER_ADMIN').slice(0, 500);

  const { data: payments, error: payErr } = await supabase
    .from('master_corporate_payable_payments')
    .select('id, amount')
    .eq('payable_id', existing.id);
  if (payErr) throw new Error(payErr.message);
  const paymentIds = (payments || []).map((p) => String(p.id));

  await logCorporateFinanceAudit(supabase, {
    userId: params.userId,
    action: 'CORPORATE_PAYABLE_SECURE_DELETE',
    entityId: existing.id,
    description: `Exclusão segura AP ${existing.code}`,
    oldData: {
      code: existing.code,
      status: existing.status,
      amount: existing.net_amount,
      paid_amount: existing.paid_amount,
      reason,
      paymentIds,
    },
  });

  let deletedCash = 0;
  deletedCash += await deleteCashMovementsByFilter(supabase, {
    column: 'payable_id',
    values: [existing.id],
  });
  if (paymentIds.length) {
    deletedCash += await deleteCashMovementsByFilter(supabase, {
      column: 'payable_payment_id',
      values: paymentIds,
    });
  }

  if (paymentIds.length) {
    const { error: delPayErr } = await supabase
      .from('master_corporate_payable_payments')
      .delete()
      .in('id', paymentIds);
    if (delPayErr) throw new Error(delPayErr.message);
  }

  const { error: delApErr } = await supabase
    .from('master_corporate_payables')
    .delete()
    .eq('id', existing.id);
  if (delApErr) throw new Error(delApErr.message);

  return {
    entity: 'payable',
    id: existing.id,
    code: existing.code,
    amount: existing.net_amount,
    alreadyDeleted: false,
    deletedPayments: paymentIds.length,
    deletedCashMovements: deletedCash,
    canceledAsaasCharges: 0,
    archivedOrRemovedAsaasCharges: 0,
    localOnlyAsaas: false,
    message: `Conta ${existing.code} excluída. ${paymentIds.length} pagamento(s) e ${deletedCash} lançamento(s) de caixa foram removidos.`,
  };
}

export async function deleteCorporateCashMovementSecure(
  supabase: SupabaseClient,
  params: {
    id: string;
    confirmWord: string;
    userId: string | null;
    reason?: string | null;
  },
): Promise<SecureDeleteSummary & { originHref?: string | null }> {
  assertSecureDeleteConfirmWord(params.confirmWord);

  const { data: row, error } = await supabase
    .from('master_corporate_cash_movements')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  if (error) throw new Error(error.message);

  if (!row) {
    return {
      entity: 'cash_movement',
      id: params.id,
      code: '',
      amount: null,
      alreadyDeleted: true,
      deletedPayments: 0,
      deletedCashMovements: 0,
      canceledAsaasCharges: 0,
      archivedOrRemovedAsaasCharges: 0,
      localOnlyAsaas: false,
      message: 'Movimento já inexistente (idempotente).',
      originHref: null,
    };
  }

  const origin = String(row.origin || '');
  if (!isManualCorporateCashOrigin(origin)) {
    const href = row.receivable_id
      ? `/master/corporate-finance/receivables/${row.receivable_id}`
      : row.payable_id
        ? `/master/corporate-finance/payables/${row.payable_id}`
        : null;
    const err = new Error(corporateCashDerivedDeleteBlockMessage(origin));
    (err as Error & { originHref?: string | null; code?: string }).originHref = href;
    (err as Error & { code?: string }).code = 'CASH_DERIVED_BLOCKED';
    throw err;
  }

  const reason = String(params.reason || 'Exclusão movimento manual').slice(0, 500);
  const code = String(row.code || '');
  const amount = money(row.amount);

  await logCorporateFinanceAudit(supabase, {
    userId: params.userId,
    action: 'CORPORATE_CASH_MOVEMENT_SECURE_DELETE',
    entityId: String(row.id),
    description: `Exclusão movimento manual ${code}`,
    oldData: {
      code,
      amount,
      origin,
      type: row.type,
      financial_account_id: row.financial_account_id,
      reason,
    },
  });

  if (row.reversal_movement_id) {
    await supabase
      .from('master_corporate_cash_movements')
      .update({ reversal_movement_id: null })
      .eq('id', row.id);
  }
  await supabase
    .from('master_corporate_cash_movements')
    .update({ reversal_movement_id: null })
    .eq('reversal_movement_id', row.id);

  const { error: delErr } = await supabase
    .from('master_corporate_cash_movements')
    .delete()
    .eq('id', row.id);
  if (delErr) throw new Error(delErr.message);

  return {
    entity: 'cash_movement',
    id: String(row.id),
    code,
    amount,
    alreadyDeleted: false,
    deletedPayments: 0,
    deletedCashMovements: 1,
    canceledAsaasCharges: 0,
    archivedOrRemovedAsaasCharges: 0,
    localOnlyAsaas: false,
    message: `Movimento ${code} excluído. Saldo da conta será recalculado automaticamente.`,
    originHref: null,
  };
}

/**
 * Asaas: cancelar (se aberto) + remover vínculo local.
 * Paga: apenas desvincular/arquivar local — exige forceLocalUnlink e não apaga remoto.
 */
export async function deleteCorporateAsaasChargeSecure(
  supabase: SupabaseClient,
  params: {
    id: string;
    confirmWord: string;
    userId: string | null;
    reason?: string | null;
    /** Obrigatório para cobrança paga (só unlink local). */
    forceLocalUnlink?: boolean;
    /** Não tenta cancelar remoto. */
    localOnly?: boolean;
  },
): Promise<SecureDeleteSummary> {
  assertSecureDeleteConfirmWord(params.confirmWord);

  const { data: row, error } = await supabase
    .from('master_corporate_asaas_charges')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  if (error) throw new Error(error.message);

  if (!row) {
    return {
      entity: 'asaas_charge',
      id: params.id,
      code: '',
      amount: null,
      alreadyDeleted: true,
      deletedPayments: 0,
      deletedCashMovements: 0,
      canceledAsaasCharges: 0,
      archivedOrRemovedAsaasCharges: 0,
      localOnlyAsaas: Boolean(params.localOnly),
      message: 'Cobrança local já inexistente (idempotente).',
    };
  }

  const status = String(row.local_status || '');
  const paid = isCorporateAsaasPaidStatus(status);
  const asaasPaymentId = String(row.asaas_payment_id || '');
  const receivableId = String(row.receivable_id || '');

  if (paid && !params.forceLocalUnlink) {
    throw new Error(
      'Cobrança paga não pode ser apagada no Asaas. Exclua a Conta a Receber correspondente ' +
        'ou confirme forceLocalUnlink para apenas desvincular o registro local.',
    );
  }

  let canceled = 0;
  if (!paid && status !== 'CANCELLED' && status !== 'REFUNDED' && !params.localOnly) {
    try {
      await cancelCorporateAsaasCharge(supabase, String(row.id), params.userId);
      canceled = 1;
    } catch (err) {
      if (!params.localOnly) {
        const msg = err instanceof Error ? err.message : 'Falha ao cancelar no Asaas.';
        throw new Error(`${msg} Use localOnly=true para remover só o vínculo local.`);
      }
    }
  }

  await logCorporateFinanceAudit(supabase, {
    userId: params.userId,
    action: paid
      ? 'CORPORATE_ASAAS_CHARGE_LOCAL_UNLINKED'
      : 'CORPORATE_ASAAS_CHARGE_SECURE_DELETE',
    entityId: String(row.id),
    description: `Remoção local cobrança Asaas ${asaasPaymentId}`,
    oldData: {
      asaas_payment_id: asaasPaymentId,
      local_status: status,
      original_value: row.original_value,
      receivable_id: receivableId,
      paid_at: row.paid_at,
      reason: String(params.reason || '').slice(0, 500),
      remoteDeleted: false,
    },
  });

  if (receivableId) {
    await supabase
      .from('master_corporate_receivables')
      .update({
        asaas_active_charge_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', receivableId)
      .eq('asaas_active_charge_id', String(row.id));
  }

  await supabase
    .from('master_corporate_asaas_webhook_events')
    .update({ charge_id: null })
    .eq('charge_id', String(row.id));

  const { error: delErr } = await supabase
    .from('master_corporate_asaas_charges')
    .delete()
    .eq('id', String(row.id));
  if (delErr) throw new Error(delErr.message);

  return {
    entity: 'asaas_charge',
    id: String(row.id),
    code: asaasPaymentId,
    amount: money(row.original_value),
    alreadyDeleted: false,
    deletedPayments: 0,
    deletedCashMovements: 0,
    canceledAsaasCharges: canceled,
    archivedOrRemovedAsaasCharges: 1,
    localOnlyAsaas: Boolean(params.localOnly) || paid,
    message: paid
      ? `Vínculo local da cobrança ${asaasPaymentId} removido. Histórico remoto Asaas preservado.`
      : `Cobrança ${asaasPaymentId} cancelada/removida localmente.`,
  };
}
