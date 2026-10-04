/**
 * Persistência da baixa de comissão (multitenant). Sem SQL novo.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isPendingBrokerCommission } from '@/lib/brokerCommission';
import {
  assertCommissionTenantScope,
  buildCommissionCashMovementPayload,
  normalizeCommissionPaymentMethod,
  pickBrokerDocument,
  resolveLocationFromBlock,
  shouldSkipDuplicateCommissionSettlement,
  type CommissionSettlementLinks,
} from '@/lib/brokerCommissionSettlement';

function tenantOr(tenantId: string) {
  return `tenant_id.eq.${tenantId},company_id.eq.${tenantId}`;
}

function asRecord(row: unknown): Record<string, unknown> {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return {};
  return row as Record<string, unknown>;
}

async function loadCurrentContract(
  admin: SupabaseClient,
  saleId: string,
  tenantId: string,
) {
  const { data } = await admin
    .from('contracts')
    .select('id, contract_number, project_id, block_id, customer_id, tenant_id, company_id, is_current')
    .eq('sale_id', saleId)
    .or(tenantOr(tenantId))
    .order('created_at', { ascending: false })
    .limit(5);
  const rows = (data || []) as Array<Record<string, unknown>>;
  const current = rows.find((r) => r.is_current !== false) || rows[0] || null;
  return current;
}

export async function settlePendingBrokerCommissions(params: {
  supabase: SupabaseClient;
  tenantId: string;
  userId: string;
  brokerId: string;
  brokerName: string;
  paymentMethod: string;
  paidAt?: string;
}): Promise<{ paidCount: number; cashIds: string[]; skipped: number }> {
  const tenantId = String(params.tenantId || '').trim();
  const brokerId = String(params.brokerId || '').trim();
  if (!tenantId) throw new Error('Empresa/tenant ausente.');
  if (!brokerId) throw new Error('Corretor ausente.');

  const { data: pendingRows, error: pendingErr } = await params.supabase
    .from('broker_commissions')
    .select(
      'id, sale_id, broker_id, amount, status, tenant_id, company_id, customer_id, contract_id',
    )
    .eq('broker_id', brokerId)
    .or(tenantOr(tenantId));

  if (pendingErr) throw new Error(pendingErr.message);

  const pending = (pendingRows || []).filter((row) =>
    isPendingBrokerCommission((row as { status?: string }).status),
  ) as Array<Record<string, unknown>>;

  if (pending.length === 0) {
    throw new Error('Não há comissão pendente para pagamento.');
  }

  const rawPaymentMethod = String(params.paymentMethod || '').trim();
  if (!rawPaymentMethod) {
    throw new Error('Forma de pagamento obrigatória.');
  }
  const paymentMethod = normalizeCommissionPaymentMethod(rawPaymentMethod);

  const existingCash: Array<Record<string, unknown>> = [];

  const { data: brokerRow } = await params.supabase
    .from('brokers')
    .select('id, name, full_name, cpf, cpf_cnpj, document, tenant_id, company_id')
    .eq('id', brokerId)
    .or(tenantOr(tenantId))
    .maybeSingle();

  const broker = asRecord(brokerRow);
  assertCommissionTenantScope({
    actorTenantId: tenantId,
    rowTenantId: broker.tenant_id as string | undefined,
    rowCompanyId: broker.company_id as string | undefined,
  });

  const paidAt = params.paidAt || new Date().toISOString();
  const cashIds: string[] = [];
  let paidCount = 0;
  let skipped = 0;

  for (const comm of pending) {
    assertCommissionTenantScope({
      actorTenantId: tenantId,
      rowTenantId: comm.tenant_id as string | undefined,
      rowCompanyId: comm.company_id as string | undefined,
    });

    const commissionId = String(comm.id || '');
    const amount = Number(comm.amount || 0);
    if (!commissionId || amount <= 0) continue;

    const saleId = String(comm.sale_id || '').trim() || null;
    const { data: linkedCashRows, error: linkedCashErr } = await params.supabase
      .from('cash_movements')
      .select('id, type, status, amount, sale_id, metadata, tenant_id, company_id')
      .or(tenantOr(tenantId))
      .contains('metadata', { commission_id: commissionId });
    if (linkedCashErr) throw new Error(linkedCashErr.message);
    const linkedCash = [
      ...existingCash,
      ...((linkedCashRows || []) as Array<Record<string, unknown>>),
    ];
    if (
      shouldSkipDuplicateCommissionSettlement({
        existingCash: linkedCash,
        commission: { id: commissionId, sale_id: saleId, amount },
      })
    ) {
      skipped += 1;
      continue;
    }

    let sale: Record<string, unknown> = {};
    if (saleId) {
      const { data: saleRow, error: saleErr } = await params.supabase
        .from('sales')
        .select(
          'id, project_id, block_id, lot_id, customer_id, broker_id, tenant_id, company_id',
        )
        .eq('id', saleId)
        .or(tenantOr(tenantId))
        .maybeSingle();
      if (saleErr) throw new Error(saleErr.message);
      sale = asRecord(saleRow);
      if (sale.id) {
        assertCommissionTenantScope({
          actorTenantId: tenantId,
          rowTenantId: sale.tenant_id as string | undefined,
          rowCompanyId: sale.company_id as string | undefined,
        });
      }
    }

    const contract = saleId
      ? await loadCurrentContract(params.supabase, saleId, tenantId)
      : null;

    const customerId =
      String(comm.customer_id || sale.customer_id || contract?.customer_id || '').trim() ||
      null;
    const projectId =
      String(sale.project_id || contract?.project_id || '').trim() || null;
    const contractId =
      String(comm.contract_id || contract?.id || '').trim() || null;
    const blockId =
      String(sale.block_id || sale.lot_id || contract?.block_id || '').trim() || null;

    let customerName = '';
    if (customerId) {
      const { data: customer } = await params.supabase
        .from('customers')
        .select('id, name, full_name, tenant_id, company_id')
        .eq('id', customerId)
        .or(tenantOr(tenantId))
        .maybeSingle();
      const c = asRecord(customer);
      customerName = String(c.name || c.full_name || '').trim();
    }

    let projectName = '';
    if (projectId) {
      const { data: project } = await params.supabase
        .from('projects')
        .select('id, name, tenant_id, company_id')
        .eq('id', projectId)
        .or(tenantOr(tenantId))
        .maybeSingle();
      projectName = String(asRecord(project).name || '').trim();
    }

    let locationLabel = '';
    if (blockId) {
      const { data: block } = await params.supabase
        .from('blocks')
        .select('id, block_name, name, number, lot_number, tenant_id, company_id')
        .eq('id', blockId)
        .or(tenantOr(tenantId))
        .maybeSingle();
      locationLabel = resolveLocationFromBlock(asRecord(block));
    }

    const links: CommissionSettlementLinks = {
      tenantId,
      commissionId,
      saleId,
      brokerId,
      customerId,
      projectId,
      contractId,
      blockId,
      brokerName:
        String(broker.name || broker.full_name || params.brokerName || '').trim(),
      brokerDocument: pickBrokerDocument(broker),
      customerName,
      projectName,
      contractNumber: String(contract?.contract_number || '').trim(),
      locationLabel,
      amount,
      paymentMethod,
      paidAt,
      userId: params.userId,
    };

    const payload = buildCommissionCashMovementPayload(links);
    const { data: inserted, error: cashErr } = await params.supabase
      .from('cash_movements')
      .insert([payload])
      .select('id')
      .single();

    if (cashErr || !inserted?.id) {
      throw new Error(
        cashErr?.message || 'Falha ao registrar a saída da comissão no fluxo de caixa.',
      );
    }

    const { error: paidErr } = await params.supabase
      .from('broker_commissions')
      .update({
        status: 'pago',
        paid_at: paidAt,
      })
      .eq('id', commissionId)
      .or(tenantOr(tenantId));

    if (paidErr) {
      await params.supabase
        .from('cash_movements')
        .update({ status: 'estornado' })
        .eq('id', inserted.id)
        .or(tenantOr(tenantId));
      throw new Error(paidErr.message);
    }

    cashIds.push(String(inserted.id));
    existingCash.push({
      id: inserted.id,
      type: 'saida',
      status: 'ativo',
      amount,
      sale_id: saleId,
      metadata: payload.metadata,
    });
    paidCount += 1;
  }

  return { paidCount, cashIds, skipped };
}
