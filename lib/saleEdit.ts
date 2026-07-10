/**
 * Carregar e atualizar vendas concluídas (lote vendido no mapa GIS).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  customerToFormValues,
  mergeCustomerData,
  mergeCustomerPatchFromForm,
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
import { saleSpouseFormFieldsFromSale } from '@/lib/saleSpouseFields';
import {
  buildSaleEditFinancePayloads,
  isPaidFinanceReceipt,
  planFullFinanceRecalc,
  planPartialFinanceRecalc,
} from '@/lib/saleEditFinanceRecalc';
import { parseCurrencyBRLNumber } from '@/lib/currencyBrl';
import {
  DEFAULT_INSTALLMENT_CORRECTION_TYPE,
  normalizeInstallmentCorrectionType,
} from '@/lib/installmentCorrectionType';
import { normalizeSaleContractModel } from '@/lib/contractModel';

import { isPartnerPanelAdmin } from '@/lib/partnerPanelAdmin';
import { cpfCnpjIlikePatterns, matchesCpfCnpj } from '@/lib/inputMasks';
import {
  BALLOON_EDIT_LOCKED_MESSAGE,
  BALLOON_MIGRATION_REQUIRED_MESSAGE,
  emptyBalloonFormConfig,
  resolveSaleBalloonPlan,
  validateSaleBalloonConfiguration,
  type SaleBalloonFormConfig,
} from '@/lib/saleBalloonInstallments';
import {
  balloonSalesPatchFromPlan,
  loadSaleBalloonRows,
  probeBalloonSchemaAvailable,
  replaceSaleBalloonInstallments,
  saleHasGeneratedCharges,
} from '@/lib/saleBalloonRepository';
import {
  downPaymentReducesInstallmentBase,
  resolveInstallmentPrincipal,
} from '@/lib/saleInstallmentCalc';

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
    financial_account_id?: string;
    signal_contract_value?: string;
    signal_paid_at_sale?: string;
    signal_remaining_payment_mode?: 'FIRST_INSTALLMENTS' | 'ALL_INSTALLMENTS' | '';
    signal_remaining_installments?: string;
    use_balloon_installments?: boolean;
    balloon_config?: SaleBalloonFormConfig | null;
    balloon_locked?: boolean;
  };
  saleBefore: Record<string, unknown>;
  customerBefore: Record<string, unknown>;
};

const isPaidReceipt = isPaidFinanceReceipt;

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
    const patterns = cpfCnpjIlikePatterns(doc);
    const orParts = patterns.map((p) => `cpf_cnpj.ilike.%${p}%`);
    const { data: clientRows } = await supabase
      .from('clients')
      .select('*')
      .or(orParts.join(','))
      .limit(5);
    const clientRow = (clientRows || []).find((row) =>
      matchesCpfCnpj(doc, row.cpf_cnpj),
    );
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

  const balloonRows = await loadSaleBalloonRows(supabase, saleId);
  const balloonLocked = await saleHasGeneratedCharges(supabase, saleId);
  const useBalloon =
    Boolean(sale.use_balloon_installments) || balloonRows.length > 0;
  const balloonConfig =
    (sale.balloon_config as SaleBalloonFormConfig | null) ||
    (useBalloon
      ? {
          ...emptyBalloonFormConfig(),
          mode: (sale.balloon_mode as SaleBalloonFormConfig['mode']) || 'MANUAL',
          manualCount: balloonRows.length || 1,
          manualRows: balloonRows.map((r) => ({
            installmentNumber: String(r.installment_number),
            additionalAmount: String(r.additional_amount ?? ''),
            dueDate: r.due_date ? String(r.due_date).split('T')[0] : '',
          })),
        }
      : emptyBalloonFormConfig());

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
    ...saleSpouseFormFieldsFromSale(sale),
    payment_type: paymentType,
    discount_value: discountVal > 0 ? formatCurrencyBRL(discountVal) : '',
    down_payment: formatCurrencyBRL(
      Number(
        sale.signal_contract_value ??
          sale.down_payment ??
          entryReceipt?.amount ??
          0,
      ) || 0,
    ),
    signal_contract_value: formatCurrencyBRL(
      Number(
        sale.signal_contract_value ??
          sale.down_payment ??
          entryReceipt?.amount ??
          0,
      ) || 0,
    ),
    signal_paid_at_sale:
      sale.signal_paid_at_sale != null
        ? formatCurrencyBRL(Number(sale.signal_paid_at_sale) || 0)
        : entryReceipt && isPaidReceipt(entryReceipt)
          ? formatCurrencyBRL(Number(entryReceipt.amount) || 0)
          : '',
    signal_remaining_payment_mode:
      (sale.signal_remaining_payment_mode as
        | 'FIRST_INSTALLMENTS'
        | 'ALL_INSTALLMENTS'
        | '') || 'FIRST_INSTALLMENTS',
    signal_remaining_installments:
      sale.signal_remaining_installments != null
        ? String(sale.signal_remaining_installments)
        : '',
    down_payment_due_date: downPaymentDue ? String(downPaymentDue) : '',
    installments_count: String(sale.installments_count ?? 1),
    first_installment_due_date: firstInstDue ? String(firstInstDue) : '',
    broker_id: String(sale.broker_id || ''),
    financial_account_id: String(sale.financial_account_id || ''),
    notes: String(sale.notes || ''),
    installment_correction_type: normalizeInstallmentCorrectionType(
      sale.installment_correction_type ?? DEFAULT_INSTALLMENT_CORRECTION_TYPE,
    ),
    reservation_signal_paid: paidSignal ? Number(paidSignal.amount) || 0 : 0,
    signal_amount: paidSignal ? String(paidSignal.amount) : '',
    signal_date: paidSignal?.due_date ? String(paidSignal.due_date).split('T')[0] : '',
    use_balloon_installments: useBalloon,
    balloon_config: balloonConfig,
    balloon_locked: balloonLocked,
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

  const { data: companyRow } = await supabase
    .from('companies')
    .select('contract_model')
    .eq('id', tenantId)
    .maybeSingle();
  const contractModel = normalizeSaleContractModel(companyRow?.contract_model);
  const financeOptions = {
    contractModel,
    grossDownPayment: parseCurrencyBRLNumber(data.down_payment),
    paymentType: data.payment_type,
  };

  const customerPatch = mergeCustomerPatchFromForm(customerBefore, data);

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

  const isRecanto = contractModel === 'RECANTO_PRIMAVERA';
  const signalContractValue = isRecanto
    ? parseCurrencyBRLNumber(
        data.signal_contract_value || data.down_payment || '',
      )
    : null;
  const signalPaidAtSale =
    isRecanto &&
    data.signal_paid_at_sale != null &&
    String(data.signal_paid_at_sale).trim() !== ''
      ? parseCurrencyBRLNumber(String(data.signal_paid_at_sale))
      : null;
  const signalRemainingValue =
    signalContractValue != null && signalPaidAtSale != null
      ? Math.max(0, signalContractValue - signalPaidAtSale)
      : null;
  const signalRemainingMode =
    isRecanto && signalRemainingValue != null && signalRemainingValue > 0
      ? data.signal_remaining_payment_mode || 'FIRST_INSTALLMENTS'
      : null;
  const installmentsCount =
    data.payment_type === 'Parcelado'
      ? Number(data.installments_count) || 1
      : 1;
  const signalRemainingInstallments =
    signalRemainingMode === 'FIRST_INSTALLMENTS'
      ? Number(data.signal_remaining_installments) || null
      : signalRemainingMode === 'ALL_INSTALLMENTS'
        ? installmentsCount
        : null;
  const signalRemainingInstallmentValue =
    signalRemainingValue != null &&
    signalRemainingInstallments &&
    signalRemainingInstallments > 0
      ? Math.round((signalRemainingValue / signalRemainingInstallments) * 100) /
        100
      : null;

  const financialAccountId =
    String(data.financial_account_id || saleBefore.financial_account_id || '').trim() || null;

  const balloonPlan = resolveSaleBalloonPlan({
    useBalloon: Boolean(data.use_balloon_installments),
    installmentsCount,
    contractValue: data.final_value,
    config: (data.balloon_config as SaleBalloonFormConfig | null | undefined) ?? null,
  });
  const balloonLocked = await saleHasGeneratedCharges(supabase, saleId);
  const previousUseBalloon = Boolean(saleBefore.use_balloon_installments);
  const balloonChanged =
    previousUseBalloon !== balloonPlan.enabled ||
    JSON.stringify(saleBefore.balloon_config ?? null) !==
      JSON.stringify(balloonPlan.config ?? null) ||
    JSON.stringify(saleBefore.balloon_mode ?? null) !==
      JSON.stringify(balloonPlan.enabled ? balloonPlan.mode : null);

  const financePlanChanged =
    String(saleBefore.payment_type || '') !== String(data.payment_type || '') ||
    Number(saleBefore.installments_count || 0) !== installmentsCount ||
    Math.abs(
      Number(saleBefore.total_value || saleBefore.agreed_price || 0) -
        Number(data.final_value || 0),
    ) > 0.009 ||
    Math.abs(
      Number(saleBefore.down_payment || 0) -
        Number(
          signalContractValue ?? parseCurrencyBRLNumber(data.down_payment),
        ),
    ) > 0.009 ||
    Math.abs(
      Number(saleBefore.discount || 0) -
        parseCurrencyBRLNumber(data.discount_value),
    ) > 0.009;

  if (balloonLocked && (balloonChanged || financePlanChanged)) {
    throw new Error(BALLOON_EDIT_LOCKED_MESSAGE);
  }

  if (balloonPlan.enabled) {
    const schemaOk = await probeBalloonSchemaAvailable(supabase);
    if (!schemaOk) {
      throw new Error(BALLOON_MIGRATION_REQUIRED_MESSAGE);
    }
    const entryAmount = parseCurrencyBRLNumber(data.down_payment);
    const principal = resolveInstallmentPrincipal({
      totalValue: data.final_value,
      downPayment: entryAmount,
      contractModel,
    });
    const balloonValidation = validateSaleBalloonConfiguration({
      plan: balloonPlan,
      paymentType: data.payment_type || 'Parcelado',
      installmentsCount,
      principal,
      finalValue: data.final_value,
      entryAmount: downPaymentReducesInstallmentBase(contractModel)
        ? entryAmount
        : 0,
      firstInstallmentDueDate: data.first_installment_due_date,
      entryReducesPrincipal: downPaymentReducesInstallmentBase(contractModel),
    });
    if (!balloonValidation.valid) {
      throw new Error(balloonValidation.message);
    }
  }

  const previousBalloonRows = await loadSaleBalloonRows(supabase, saleId);
  const balloonSalesFields = balloonSalesPatchFromPlan(balloonPlan);

  const salePatch = buildOfficialSalesUpdatePatch({
    customerId,
    agreedPrice: data.final_value,
    lotPrice: finalPrice,
    discount: parseCurrencyBRLNumber(data.discount_value),
    totalValue: data.final_value,
    paymentType: data.payment_type,
    downPayment: signalContractValue ?? parseCurrencyBRLNumber(data.down_payment),
    installmentsCount,
    installmentCorrectionType:
      contractModel === 'RECANTO_PRIMAVERA'
        ? DEFAULT_INSTALLMENT_CORRECTION_TYPE
        : data.payment_type === 'Parcelado'
          ? data.installment_correction_type
          : DEFAULT_INSTALLMENT_CORRECTION_TYPE,
    brokerId,
    financialAccountId,
    signalContractValue,
    signalPaidAtSale,
    signalRemainingValue,
    signalRemainingPaymentMode: signalRemainingMode,
    signalRemainingInstallments,
    signalRemainingInstallmentValue,
    useBalloonInstallments: balloonSalesFields.use_balloon_installments,
    balloonMode: balloonSalesFields.balloon_mode,
    balloonConfig: balloonSalesFields.balloon_config as Record<string, unknown> | null,
    spouse: {
      has_spouse: data.has_spouse,
      sale_spouse_name: data.sale_spouse_name,
      sale_spouse_nationality: data.sale_spouse_nationality,
      sale_spouse_marital_status: data.sale_spouse_marital_status,
      sale_spouse_profession: data.sale_spouse_profession,
      sale_spouse_rg: data.sale_spouse_rg,
      sale_spouse_rg_issuer: data.sale_spouse_rg_issuer,
      sale_spouse_cpf: data.sale_spouse_cpf,
      sale_spouse_phone: data.sale_spouse_phone,
      sale_spouse_email: data.sale_spouse_email,
      sale_spouse_address: data.sale_spouse_address,
    },
  });
  // notes permanece apenas no formulário; coluna ausente em produção (20260608120000 não aplicada).

  {
    let patchToApply: Record<string, unknown> = { ...salePatch };
    let saleUpdErr: { message?: string } | null = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const { error } = await supabase
        .from('sales')
        .update(patchToApply)
        .eq('id', saleId);
      if (!error) {
        saleUpdErr = null;
        break;
      }
      saleUpdErr = error;
      const missing = String(error.message || '').match(
        /Could not find the '(\w+)' column/i,
      )?.[1];
      if (
        missing &&
        (missing === 'use_balloon_installments' ||
          missing === 'balloon_mode' ||
          missing === 'balloon_config') &&
        balloonPlan.enabled
      ) {
        throw new Error(BALLOON_MIGRATION_REQUIRED_MESSAGE);
      }
      if (
        missing &&
        (missing === 'use_balloon_installments' ||
          missing === 'balloon_mode' ||
          missing === 'balloon_config' ||
          missing === 'financial_account_id') &&
        missing in patchToApply
      ) {
        const { [missing]: _drop, ...rest } = patchToApply;
        patchToApply = rest;
        continue;
      }
      break;
    }
    if (saleUpdErr) {
      throw new Error(`Erro ao atualizar venda: ${saleUpdErr.message}`);
    }
  }

  if (salePatch.financial_account_id) {
    await supabase
      .from('finance_receipts')
      .update({ financial_account_id: salePatch.financial_account_id })
      .eq('sale_id', saleId)
      .in('status', ['pendente', 'pending']);
  }

  const { data: receipts, error: receiptsErr } = await supabase
    .from('finance_receipts')
    .select('id, status, paid_at, installment_number, amount, due_date')
    .eq('sale_id', saleId);

  if (receiptsErr) {
    throw new Error(`Erro ao carregar parcelas: ${receiptsErr.message}`);
  }

  const receiptRows = (receipts || []) as Array<{
    id: string;
    status?: string | null;
    paid_at?: string | null;
    installment_number: number | string;
    amount?: number | string | null;
    due_date?: string | null;
  }>;

  const newPayloads = buildSaleEditFinancePayloads(
    tenantId,
    saleId,
    customerId,
    brokerId,
    lot,
    data,
    {
      contractModel,
      financialAccountId: salePatch.financial_account_id as string,
    },
  );

  let financeChanged = false;

  const paid = receiptRows.filter(isPaidReceipt);

  if (paid.length > 0) {
    const plan = planPartialFinanceRecalc(
      receiptRows,
      newPayloads,
      data.final_value,
      financeOptions,
    );

    if (plan.needsConfirm) {
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
      plan.paid.length === 1 &&
      plan.pending.length === 0
    ) {
      const paidRec = plan.paid[0];
      const { error: updErr } = await supabase
        .from('finance_receipts')
        .update({
          amount: data.final_value,
          due_date: data.down_payment_due_date || paidRec.due_date,
        })
        .eq('id', paidRec.id);
      if (updErr) {
        throw new Error(`Erro ao atualizar parcela paga: ${updErr.message}`);
      }
      financeChanged = true;
    } else {
      if (plan.toDeleteIds.length > 0) {
        const { error: delErr } = await supabase
          .from('finance_receipts')
          .delete()
          .in('id', plan.toDeleteIds);
        if (delErr) {
          throw new Error(`Erro ao remover parcelas pendentes: ${delErr.message}`);
        }
        financeChanged = true;
      }
      if (plan.toInsert.length > 0) {
        const { error: finErr } = await supabase
          .from('finance_receipts')
          .insert(plan.toInsert);
        if (finErr) {
          throw new Error(`Erro ao recriar parcelas: ${finErr.message}`);
        }
        financeChanged = true;
      }
    }
    console.log('EDIT_SALE_FINANCE_PARTIAL_RECALC', {
      saleId,
      paidKept: plan.paid.length,
      deleted: plan.toDeleteIds.length,
      inserted: plan.toInsert.length,
    });
  } else {
    const fullPlan = planFullFinanceRecalc(newPayloads);
    const { error: delErr } = await supabase
      .from('finance_receipts')
      .delete()
      .eq('sale_id', saleId);
    if (delErr) {
      throw new Error(`Erro ao limpar parcelas antigas: ${delErr.message}`);
    }
    if (fullPlan.toInsert.length > 0) {
      const { error: finErr } = await supabase
        .from('finance_receipts')
        .insert(fullPlan.toInsert);
      if (finErr) {
        throw new Error(`Erro ao atualizar financeiro: ${finErr.message}`);
      }
    }
    financeChanged = true;
    console.log('EDIT_SALE_FINANCE_FULL_RECALC', {
      saleId,
      inserted: fullPlan.toInsert.length,
    });
  }

  if (!balloonLocked) {
    try {
      await replaceSaleBalloonInstallments(supabase, saleId, balloonPlan);
    } catch (balloonErr) {
      // Compensação: tenta restaurar balões anteriores se a gravação falhar após o financeiro.
      if (previousBalloonRows.length > 0) {
        try {
          await supabase.from('sale_balloon_installments').delete().eq('sale_id', saleId);
          await supabase.from('sale_balloon_installments').insert(
            previousBalloonRows.map((r) => ({
              sale_id: saleId,
              installment_number: r.installment_number,
              additional_amount: r.additional_amount,
              due_date: r.due_date || null,
            })),
          );
        } catch (restoreErr) {
          console.warn('[EDIT_SALE] balloon restore failed', restoreErr);
        }
      }
      throw balloonErr instanceof Error
        ? balloonErr
        : new Error('Falha ao gravar parcelas balão.');
    }
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
