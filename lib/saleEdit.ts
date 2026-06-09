/**
 * Carregar e atualizar vendas concluídas (lote vendido no mapa GIS).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  customerPatchFromForm,
  customerToFormValues,
  mergeCustomerData,
  mergePreservingCustomerFields,
  normalizeDocument,
  type CustomerFormValues,
  type CustomerRecord,
} from '@/lib/customerIdentity';
import { logCustomerAudit } from '@/lib/customerAudit';
import {
  formatCurrencyBRL,
  logLotAuditEvent,
  lotAuditContextFromBlock,
} from '@/lib/lotAudit';
import type { LotFormConfirmPayload } from '@/components/map/CustomerLotFormModal';
import { buildOfficialSalesUpdatePatch } from '@/lib/salesWriteSchema';

import { isPartnerPanelAdmin } from '@/lib/partnerPanelAdmin';

export function canEditCompletedSale(role?: string | null): boolean {
  return isPartnerPanelAdmin(role);
}

export type SaleEditLoadedContext = {
  saleId: string;
  contractId: string | null;
  customerId: string;
  lotPrice: number;
  form: CustomerFormValues & {
    payment_type: string;
    discount_value: string;
    down_payment: string;
    down_payment_due_date: string;
    installments_count: string;
    first_installment_due_date: string;
    broker_id: string;
    notes: string;
  };
  saleBefore: Record<string, unknown>;
  customerBefore: Record<string, unknown>;
};

function isPaidReceipt(r: { status?: string | null; paid_at?: string | null }) {
  const st = String(r.status || '').toLowerCase();
  return st === 'pago' || st === 'paid' || Boolean(r.paid_at);
}

export async function loadSaleEditContext(
  supabase: SupabaseClient,
  params: { blockId: string; saleId?: string | null },
): Promise<SaleEditLoadedContext> {
  console.log('EDIT_SALE_CLICK', { blockId: params.blockId, saleId: params.saleId });

  let sale: Record<string, unknown> | null = null;

  if (params.saleId) {
    const { data } = await supabase
      .from('sales')
      .select('*')
      .eq('id', params.saleId)
      .maybeSingle();
    sale = data;
  }

  if (!sale) {
    const { data } = await supabase
      .from('sales')
      .select('*')
      .eq('block_id', params.blockId)
      .in('status', ['ACTIVE', 'ativo', 'active'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    sale = data;
  }

  if (!sale?.id) {
    const { data } = await supabase
      .from('sales')
      .select('*')
      .eq('block_id', params.blockId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    sale = data;
  }

  if (!sale?.id) {
    throw new Error('Venda ativa não encontrada para este lote.');
  }

  const saleId = sale.id as string;
  console.log('EDIT_SALE_LOADED', { saleId });

  const customerId = sale.customer_id as string;
  if (!customerId) {
    throw new Error('Cliente da venda não encontrado.');
  }

  const { data: customer, error: custErr } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .single();

  if (custErr || !customer) {
    throw new Error('Não foi possível carregar o cliente da venda.');
  }

  let customerMerged = customer as CustomerRecord;
  const doc = normalizeDocument(
    String(customer.cpf_cnpj || customer.document || ''),
  );
  if (doc.length >= 11) {
    const { data: clientRow } = await supabase
      .from('clients')
      .select('*')
      .eq('cpf_cnpj', doc)
      .maybeSingle();
    if (clientRow) {
      customerMerged = mergeCustomerData(
        customer,
        clientRow,
      ) as CustomerRecord;
    }
  }

  console.log('EDIT_SALE_CUSTOMER_LOADED', { customerId });

  const { data: receipts } = await supabase
    .from('finance_receipts')
    .select('*')
    .eq('sale_id', saleId)
    .neq('status', 'cancelled')
    .order('installment_number', { ascending: true });

  console.log('EDIT_SALE_FINANCE_LOADED', {
    saleId,
    receipts: receipts?.length ?? 0,
  });

  const paidSignal = (receipts || []).find(
    (r) => Number(r.installment_number) === -1 && isPaidReceipt(r),
  );
  const entryReceipt = (receipts || []).find((r) => Number(r.installment_number) === 0);
  const firstParcel = (receipts || []).find((r) => Number(r.installment_number) === 1);
  const cashReceipt =
    (receipts || []).find((r) => Number(r.installment_number) === 1 && isPaidReceipt(r)) ||
    (receipts || [])[0];

  const paymentType = String(sale.payment_type || 'À vista');
  const lotPrice = Number(sale.lot_price ?? sale.agreed_price ?? 0) || 0;
  const discountVal = Number(sale.discount ?? sale.discount_value ?? 0) || 0;

  let downPaymentDue =
    (sale.down_payment_due_date as string) ||
    entryReceipt?.due_date ||
    (paymentType === 'À vista' ? cashReceipt?.due_date : null) ||
    '';
  let firstInstDue =
    (sale.first_installment_due_date as string) ||
    firstParcel?.due_date ||
    '';

  if (downPaymentDue && String(downPaymentDue).includes('T')) {
    downPaymentDue = String(downPaymentDue).split('T')[0];
  }
  if (firstInstDue && String(firstInstDue).includes('T')) {
    firstInstDue = String(firstInstDue).split('T')[0];
  }

  const { data: contract } = await supabase
    .from('contracts')
    .select('id, contract_number, status, needs_regenerar')
    .eq('sale_id', saleId)
    .in('status', ['ativo', 'active', 'assinado'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const form = {
    ...customerToFormValues(customerMerged),
    payment_type: paymentType,
    discount_value: discountVal > 0 ? String(discountVal) : '',
    down_payment: String(sale.down_payment ?? entryReceipt?.amount ?? 0),
    down_payment_due_date: downPaymentDue ? String(downPaymentDue) : '',
    installments_count: String(sale.installments_count ?? 1),
    first_installment_due_date: firstInstDue ? String(firstInstDue) : '',
    broker_id: String(sale.broker_id || ''),
    notes: String(sale.notes || ''),
    reservation_signal_paid: paidSignal ? Number(paidSignal.amount) || 0 : 0,
    signal_amount: paidSignal ? String(paidSignal.amount) : '',
    signal_date: paidSignal?.due_date ? String(paidSignal.due_date).split('T')[0] : '',
  };

  return {
    saleId,
    contractId: (contract?.id as string) || null,
    customerId,
    lotPrice,
    form,
    saleBefore: { ...sale },
    customerBefore: { ...customerMerged },
  };
}

function buildFinancePayloads(
  tenantId: string,
  saleId: string,
  customerId: string,
  brokerId: string | null,
  lot: { id: string; project_id?: string | null },
  data: LotFormConfirmPayload,
): Record<string, unknown>[] {
  const financePayloads: Record<string, unknown>[] = [];
  const pmtType = data.payment_type || 'À vista';
  const grossDownPayment = Number(data.down_payment) || 0;
  const reservationSignalPaid = Number(data.reservation_signal_paid) || 0;
  let downPayment = grossDownPayment;
  const instCount = Math.max(1, Number(data.installments_count) || 1);
  const fValue = data.final_value;

  if (reservationSignalPaid > 0 && pmtType === 'Parcelado') {
    downPayment = Math.max(0, grossDownPayment - reservationSignalPaid);
  }

  if (pmtType === 'À vista') {
    financePayloads.push({
      tenant_id: tenantId,
      company_id: tenantId,
      sale_id: saleId,
      customer_id: customerId,
      broker_id: brokerId,
      project_id: lot.project_id || null,
      block_id: lot.id,
      installment_number: 1,
      amount: fValue,
      due_date: data.down_payment_due_date || new Date().toISOString().split('T')[0],
      status: 'pendente',
    });
  } else if (pmtType === 'Parcelado') {
    let currentInst = 1;
    if (reservationSignalPaid > 0) {
      financePayloads.push({
        tenant_id: tenantId,
        company_id: tenantId,
        sale_id: saleId,
        customer_id: customerId,
        broker_id: brokerId,
        project_id: lot.project_id || null,
        block_id: lot.id,
        installment_number: -1,
        amount: reservationSignalPaid,
        due_date:
          data.signal_date ||
          data.down_payment_due_date ||
          new Date().toISOString().split('T')[0],
        status: 'pago',
        paid_at: new Date().toISOString(),
      });
    }
    if (downPayment > 0 && data.down_payment_due_date) {
      financePayloads.push({
        tenant_id: tenantId,
        company_id: tenantId,
        sale_id: saleId,
        customer_id: customerId,
        broker_id: brokerId,
        project_id: lot.project_id || null,
        block_id: lot.id,
        installment_number: 0,
        amount: downPayment,
        due_date: data.down_payment_due_date,
        status: 'pendente',
      });
    }
    if (data.first_installment_due_date) {
      const totalRestante = Math.max(0, fValue - downPayment);
      const parValue = Math.round((totalRestante / instCount) * 100) / 100;
      let accumulated = 0;
      let cDate = new Date(data.first_installment_due_date + 'T12:00:00Z');
      for (let i = 0; i < instCount; i++) {
        const isLast = i === instCount - 1;
        const currentAmount = isLast
          ? Number((totalRestante - accumulated).toFixed(2))
          : parValue;
        accumulated += currentAmount;
        financePayloads.push({
          tenant_id: tenantId,
          company_id: tenantId,
          sale_id: saleId,
          customer_id: customerId,
          broker_id: brokerId,
          project_id: lot.project_id || null,
          block_id: lot.id,
          installment_number: currentInst++,
          amount: currentAmount,
          due_date: cDate.toISOString().split('T')[0],
          status: 'pendente',
        });
        cDate.setMonth(cDate.getMonth() + 1);
      }
    }
  }

  return financePayloads;
}

export async function updateSaleFromEdit(
  supabase: SupabaseClient,
  params: {
    lot: {
      id: string;
      project_id?: string | null;
      price?: number;
      saleId: string;
      contractId?: string | null;
    };
    tenantId: string;
    userId: string;
    data: LotFormConfirmPayload;
    saleBefore: Record<string, unknown>;
    customerBefore: Record<string, unknown>;
    customerId: string;
  },
): Promise<{ contractId: string | null; financeChanged: boolean }> {
  const { lot, tenantId, userId, data, saleBefore, customerBefore, customerId } =
    params;
  const saleId = lot.saleId;
  const finalPrice = data.lot_value;
  const brokerId = data.broker_id?.trim() ? data.broker_id : null;

  const customerPatch = mergePreservingCustomerFields(
    customerBefore,
    customerPatchFromForm(data),
  );

  await logCustomerAudit(supabase, {
    customerId,
    oldData: customerBefore,
    newData: { ...customerBefore, ...customerPatch },
    changedBy: userId,
    source: 'sale_edit',
  });

  const { error: custUpdErr } = await supabase
    .from('customers')
    .update(customerPatch)
    .eq('id', customerId);

  if (custUpdErr) {
    throw new Error(`Erro ao atualizar cliente: ${custUpdErr.message}`);
  }

  const salePatch = buildOfficialSalesUpdatePatch({
    customerId,
    agreedPrice: data.final_value,
    lotPrice: finalPrice,
    discount: Number(data.discount_value) || 0,
    totalValue: data.final_value,
    paymentType: data.payment_type,
    downPayment: Number(data.down_payment) || 0,
    installmentsCount: Math.max(1, Number(data.installments_count) || 1),
    brokerId,
  });
  // notes permanece apenas no formulário; coluna ausente em produção (20260608120000 não aplicada).

  const { error: saleUpdErr } = await supabase
    .from('sales')
    .update(salePatch)
    .eq('id', saleId);

  if (saleUpdErr) {
    throw new Error(`Erro ao atualizar venda: ${saleUpdErr.message}`);
  }

  const { data: receipts } = await supabase
    .from('finance_receipts')
    .select('id, status, paid_at, installment_number, amount')
    .eq('sale_id', saleId);

  const paid = (receipts || []).filter(isPaidReceipt);
  const pending = (receipts || []).filter((r) => !isPaidReceipt(r));

  const newPayloads = buildFinancePayloads(
    tenantId,
    saleId,
    customerId,
    brokerId,
    lot,
    data,
  );

  let financeChanged = false;

  if (paid.length > 0) {
    const paidTotal = paid.reduce((s, r) => s + Number(r.amount || 0), 0);
    const newPendingTotal = newPayloads
      .filter((p) => p.status === 'pendente')
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    const expectedTotal = data.final_value;
    const diff = Math.abs(paidTotal + newPendingTotal - expectedTotal);
    if (diff > 0.05 && (pending.length > 0 || newPendingTotal > 0)) {
      const ok =
        typeof window !== 'undefined' &&
        window.confirm(
          'Existem parcelas já pagas. As parcelas em aberto serão recalculadas. Deseja continuar?',
        );
      if (!ok) {
        throw new Error('Alteração financeira cancelada pelo usuário.');
      }
    }

    if (
      data.payment_type === 'À vista' &&
      paid.length === 1 &&
      pending.length === 0
    ) {
      const paidRec = paid[0];
      await supabase
        .from('finance_receipts')
        .update({
          amount: data.final_value,
          due_date: data.down_payment_due_date || paidRec.due_date,
        })
        .eq('id', paidRec.id);
      financeChanged = true;
    } else {
      if (pending.length > 0) {
        const pendingIds = pending.map((r) => r.id);
        await supabase.from('finance_receipts').delete().in('id', pendingIds);
        financeChanged = true;
      }
      const paidNumbers = new Set(paid.map((r) => r.installment_number));
      const toInsert = newPayloads.filter(
        (p) =>
          p.status === 'pendente' &&
          !paidNumbers.has(p.installment_number as number),
      );
      if (toInsert.length > 0) {
        const { error: finErr } = await supabase
          .from('finance_receipts')
          .insert(toInsert);
        if (finErr) throw new Error(`Erro ao recriar parcelas: ${finErr.message}`);
        financeChanged = true;
      }
    }
    console.log('EDIT_SALE_FINANCE_PARTIAL_RECALC', {
      saleId,
      paidKept: paid.length,
    });
  } else {
    await supabase.from('finance_receipts').delete().eq('sale_id', saleId);
    if (newPayloads.length > 0) {
      const { error: finErr } = await supabase.from('finance_receipts').insert(newPayloads);
      if (finErr) throw new Error(`Erro ao atualizar financeiro: ${finErr.message}`);
    }
    financeChanged = true;
    console.log('EDIT_SALE_FINANCE_FULL_RECALC', { saleId });
  }

  await supabase
    .from('contracts')
    .update({ needs_regenerar: true })
    .eq('sale_id', saleId)
    .in('status', ['ativo', 'active', 'assinado']);

  const { error: blockErr } = await supabase
    .from('blocks')
    .update({
      customer_id: customerId,
      price: finalPrice,
      status: 'Vendido',
      broker_id: brokerId,
    })
    .eq('id', lot.id);

  if (blockErr) {
    console.warn('[EDIT_SALE] block update', blockErr.message);
  }

  const saleAfter = { ...saleBefore, ...salePatch, id: saleId };
  const customerAfter = { ...customerBefore, ...customerPatch, id: customerId };

  try {
    await supabase.from('audit_logs').insert([
      {
        tenant_id: tenantId,
        company_id: tenantId,
        user_id: userId,
        action: 'sale_updated',
        module: 'SALES',
        entity_type: 'sales',
        entity_id: saleId,
        reference_id: saleId,
        description: `Venda do lote ${lot.id} atualizada`,
        old_data: { sale: saleBefore, customer: customerBefore },
        new_data: { sale: saleAfter, customer: customerAfter, financeChanged },
      },
    ]);
  } catch (auditErr) {
    console.warn('[EDIT_SALE] audit log', auditErr);
  }

  try {
    await supabase.from('logs').insert({
      tenant_id: tenantId,
      user_id: userId,
      action: 'sale_updated',
      details: {
        title: 'Venda editada pelo mapa GIS',
        sale_id: saleId,
        block_id: lot.id,
        financeChanged,
      },
    });
  } catch {
    /* optional */
  }

  console.log('EDIT_SALE_SUCCESS', { saleId, financeChanged });

  const lotCtx = lotAuditContextFromBlock(
    { id: lot.id, project_id: lot.project_id },
    {
      companyId: tenantId,
      saleId,
      contractId: lot.contractId ?? null,
    },
  );

  void logLotAuditEvent(supabase, {
    ...lotCtx,
    userId,
    action: 'sale_edited',
    title: 'Venda editada',
    description: `Valor final ${formatCurrencyBRL(Number(data.final_value) || 0)}`,
    oldData: { sale: saleBefore },
    newData: { sale: saleAfter },
    source: 'sale_flow',
  });

  if (customerAuditHasChanges(customerBefore, customerAfter)) {
    void logLotAuditEvent(supabase, {
      ...lotCtx,
      userId,
      action: 'customer_changed',
      title: 'Dados do cliente alterados',
      description: 'Cadastro do comprador atualizado na edição da venda',
      oldData: { customer: customerBefore },
      newData: { customer: customerAfter },
      source: 'customer_flow',
    });
  }

  if (financeChanged) {
    void logLotAuditEvent(supabase, {
      ...lotCtx,
      userId,
      action: 'finance_created',
      title: 'Parcelas recalculadas',
      description: 'Financeiro atualizado após edição da venda',
      source: 'finance_flow',
    });
  }

  return { contractId: lot.contractId || null, financeChanged };
}

function customerAuditHasChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): boolean {
  const keys = [
    'rg',
    'profession',
    'civil_state',
    'marital_status',
    'address',
    'neighborhood',
    'city',
    'state',
    'state_uf',
    'zip_code',
    'cep',
    'phone',
    'email',
  ];
  return keys.some(
    (k) => String(before[k] ?? '') !== String(after[k] ?? ''),
  );
}
