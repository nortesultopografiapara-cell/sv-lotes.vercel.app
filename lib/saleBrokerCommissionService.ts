import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildCanceledCommissionPatch,
  assertCanCancelCommissionRows,
  buildPendingCommissionInsert,
  filterPendingCommissionRows,
  resolveManualCommissionUpdate,
  resolveTransferCommissionPlan,
  SaleBrokerCommissionError,
  type ManageSaleBrokerCommissionInput,
} from '@/lib/saleBrokerCommissionManage';
import {
  isPaidBrokerCommission,
  isPendingBrokerCommission,
  resolveSaleValueForCommission,
} from '@/lib/brokerCommission';

type CommissionRow = {
  id: string;
  sale_id?: string | null;
  broker_id?: string | null;
  amount?: number | string | null;
  status?: string | null;
  paid_at?: string | null;
};

async function loadSaleForTenant(
  admin: SupabaseClient,
  saleId: string,
  tenantId: string,
) {
  const { data, error } = await admin
    .from('sales')
    .select('*')
    .eq('id', saleId)
    .maybeSingle();

  if (error) throw new SaleBrokerCommissionError(error.message, 'SALE_LOAD_ERROR', 500);
  if (!data) throw new SaleBrokerCommissionError('Venda não encontrada', 'SALE_NOT_FOUND', 404);

  const saleTenant = data.tenant_id || data.company_id;
  if (saleTenant && tenantId && saleTenant !== tenantId) {
    throw new SaleBrokerCommissionError(
      'Venda fora do escopo da empresa',
      'SALE_TENANT_MISMATCH',
      403,
    );
  }

  return data as Record<string, unknown>;
}

async function loadSaleCommissions(
  admin: SupabaseClient,
  saleId: string,
): Promise<CommissionRow[]> {
  const { data, error } = await admin
    .from('broker_commissions')
    .select('id, sale_id, broker_id, amount, commission_percent, status, paid_at')
    .eq('sale_id', saleId);

  if (error) {
    throw new SaleBrokerCommissionError(error.message, 'COMMISSION_LOAD_ERROR', 500);
  }
  return (data || []) as CommissionRow[];
}

async function cancelPendingCommissions(
  admin: SupabaseClient,
  rows: CommissionRow[],
) {
  const pending = filterPendingCommissionRows(rows);
  if (pending.length === 0) return { canceledIds: [] as string[] };

  assertCanCancelCommissionRows(pending);

  const canceledIds: string[] = [];
  for (const row of pending) {
    const { error } = await admin
      .from('broker_commissions')
      .update(buildCanceledCommissionPatch())
      .eq('id', row.id);
    if (error) {
      throw new SaleBrokerCommissionError(error.message, 'COMMISSION_CANCEL_ERROR', 500);
    }
    canceledIds.push(row.id);
  }
  return { canceledIds };
}

async function syncSaleBrokerId(
  admin: SupabaseClient,
  saleId: string,
  brokerId: string | null,
) {
  const { error: saleErr } = await admin
    .from('sales')
    .update({ broker_id: brokerId })
    .eq('id', saleId);
  if (saleErr) {
    throw new SaleBrokerCommissionError(saleErr.message, 'SALE_UPDATE_ERROR', 500);
  }

  await admin.from('contracts').update({ broker_id: brokerId }).eq('sale_id', saleId);
  await admin.from('blocks').update({ broker_id: brokerId }).eq('sale_id', saleId);
}

async function insertAuditLog(
  admin: SupabaseClient,
  params: {
    tenantId: string;
    userId: string;
    action: string;
    description: string;
    referenceId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  try {
    await admin.from('audit_logs').insert([
      {
        tenant_id: params.tenantId,
        company_id: params.tenantId,
        user_id: params.userId,
        action: params.action,
        module: 'BROKERS',
        description: params.description,
        reference_id: params.referenceId ?? null,
        metadata: params.metadata ?? null,
      },
    ]);
  } catch {
    /* auditoria não bloqueia operação */
  }
}

export async function getSaleBrokerCommissionState(
  admin: SupabaseClient,
  saleId: string,
  tenantId: string,
) {
  const sale = await loadSaleForTenant(admin, saleId, tenantId);
  const commissions = await loadSaleCommissions(admin, saleId);

  let broker = null;
  if (sale.broker_id) {
    const { data } = await admin
      .from('brokers')
      .select('id, name, commission_percent')
      .eq('id', sale.broker_id)
      .maybeSingle();
    broker = data;
  }

  const pending = commissions.filter((c) => isPendingBrokerCommission(c.status));
  const pendingTotal = pending.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

  return {
    sale: {
      id: sale.id,
      broker_id: sale.broker_id ?? null,
      sale_value: resolveSaleValueForCommission(sale),
    },
    broker,
    commissions,
    pending_total: pendingTotal,
  };
}

export async function executeManageSaleBrokerCommission(
  admin: SupabaseClient,
  params: {
    saleId: string;
    tenantId: string;
    userId: string;
    input: ManageSaleBrokerCommissionInput;
  },
) {
  const sale = await loadSaleForTenant(admin, params.saleId, params.tenantId);
  const tenantId =
    params.tenantId ||
    String(sale.tenant_id || sale.company_id || '');
  let commissions = await loadSaleCommissions(admin, params.saleId);

  const result: Record<string, unknown> = {
    action: params.input.action,
    sale_id: params.saleId,
    canceled_commission_ids: [] as string[],
    created_commission_id: null as string | null,
    broker_id: sale.broker_id ?? null,
  };

  if (params.input.action === 'remove_broker') {
    const { canceledIds } = await cancelPendingCommissions(admin, commissions);
    await syncSaleBrokerId(admin, params.saleId, null);
    result.canceled_commission_ids = canceledIds;
    result.broker_id = null;

    await insertAuditLog(admin, {
      tenantId,
      userId: params.userId,
      action: 'SALE_BROKER_REMOVED',
      description: `Corretor removido da venda ${params.saleId}. Comissões pendentes canceladas: ${canceledIds.length}.`,
      referenceId: params.saleId,
      metadata: { canceledIds },
    });
    return result;
  }

  if (params.input.action === 'transfer_broker') {
    const brokerId = String(params.input.broker_id || '').trim();
    if (!brokerId) {
      throw new SaleBrokerCommissionError(
        'Informe o corretor de destino',
        'BROKER_REQUIRED',
        400,
      );
    }

    const { data: targetBroker, error: brokerErr } = await admin
      .from('brokers')
      .select('id, name, commission_percent, tenant_id, company_id')
      .eq('id', brokerId)
      .maybeSingle();

    if (brokerErr || !targetBroker) {
      throw new SaleBrokerCommissionError(
        'Corretor de destino não encontrado',
        'BROKER_NOT_FOUND',
        404,
      );
    }

    const brokerTenant = targetBroker.tenant_id || targetBroker.company_id;
    if (brokerTenant && tenantId && brokerTenant !== tenantId) {
      throw new SaleBrokerCommissionError(
        'Corretor fora do escopo da empresa',
        'BROKER_TENANT_MISMATCH',
        403,
      );
    }

    const { canceledIds } = await cancelPendingCommissions(admin, commissions);
    await syncSaleBrokerId(admin, params.saleId, brokerId);

    const plan = resolveTransferCommissionPlan({
      sale: { ...sale, id: params.saleId, tenant_id: tenantId },
      targetBroker,
    });

    if (plan.pendingInsert) {
      const { data: inserted, error: insErr } = await admin
        .from('broker_commissions')
        .insert([plan.pendingInsert])
        .select('id')
        .single();
      if (insErr) {
        throw new SaleBrokerCommissionError(insErr.message, 'COMMISSION_INSERT_ERROR', 500);
      }
      result.created_commission_id = inserted?.id ?? null;
    }

    result.canceled_commission_ids = canceledIds;
    result.broker_id = brokerId;

    await insertAuditLog(admin, {
      tenantId,
      userId: params.userId,
      action: 'SALE_BROKER_TRANSFERRED',
      description: `Venda ${params.saleId} transferida para corretor ${targetBroker.name}.`,
      referenceId: params.saleId,
      metadata: {
        from_broker_id: sale.broker_id ?? null,
        to_broker_id: brokerId,
        commission_percent: plan.commissionPercent,
        canceledIds,
        created_commission_id: result.created_commission_id,
      },
    });
    return result;
  }

  if (params.input.action === 'cancel_commission') {
    const { canceledIds } = await cancelPendingCommissions(admin, commissions);
    result.canceled_commission_ids = canceledIds;

    await insertAuditLog(admin, {
      tenantId,
      userId: params.userId,
      action: 'SALE_COMMISSION_CANCELED',
      description: `Comissão pendente cancelada na venda ${params.saleId}.`,
      referenceId: params.saleId,
      metadata: { canceledIds },
    });
    return result;
  }

  if (params.input.action === 'update_commission') {
    const pendingRows = filterPendingCommissionRows(commissions);
    const paidRows = commissions.filter((row) => isPaidBrokerCommission(row.status));
    if (paidRows.length > 0) {
      throw new SaleBrokerCommissionError(
        'Comissão já paga não pode ser alterada diretamente. Use estorno manual no Financeiro.',
        'COMMISSION_ALREADY_PAID',
        409,
      );
    }

    const patch = resolveManualCommissionUpdate({
      sale,
      commission_percent: params.input.commission_percent,
      fixed_amount: params.input.fixed_amount,
    });

    if (pendingRows.length > 0) {
      for (const row of pendingRows) {
        const { error } = await admin
          .from('broker_commissions')
          .update({
            amount: patch.amount,
            commission_percent: patch.commission_percent,
            status: patch.status,
            paid_at: null,
          })
          .eq('id', row.id);
        if (error) {
          throw new SaleBrokerCommissionError(error.message, 'COMMISSION_UPDATE_ERROR', 500);
        }
      }
      result.canceled_commission_ids = patch.status === 'cancelado' ? pendingRows.map((r) => r.id) : [];
    } else if (sale.broker_id && patch.status === 'pendente' && patch.amount > 0) {
      const insertPayload = buildPendingCommissionInsert({
        tenantId,
        brokerId: String(sale.broker_id),
        saleId: params.saleId,
        contractId: (sale.contract_id as string | null) ?? null,
        customerId: (sale.customer_id as string | null) ?? null,
        saleValue: resolveSaleValueForCommission(sale),
        commissionPercent: patch.commission_percent,
      });
      if (insertPayload) {
        insertPayload.amount = patch.amount;
        insertPayload.commission_percent = patch.commission_percent;
        const { data: inserted, error: insErr } = await admin
          .from('broker_commissions')
          .insert([insertPayload])
          .select('id')
          .single();
        if (insErr) {
          throw new SaleBrokerCommissionError(insErr.message, 'COMMISSION_INSERT_ERROR', 500);
        }
        result.created_commission_id = inserted?.id ?? null;
      }
    } else if (patch.status === 'cancelado') {
      result.canceled_commission_ids = [];
    }

    await insertAuditLog(admin, {
      tenantId,
      userId: params.userId,
      action: 'SALE_COMMISSION_UPDATED',
      description: `Comissão da venda ${params.saleId} atualizada manualmente.`,
      referenceId: params.saleId,
      metadata: { patch },
    });
    return result;
  }

  throw new SaleBrokerCommissionError('Ação inválida', 'INVALID_ACTION', 400);
}
