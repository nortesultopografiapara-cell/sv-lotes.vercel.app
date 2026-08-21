/**
 * Criação de venda pelo GIS — core transacional com logs [sales/create].
 * Contrato é gerado após marcar lote vendido; falha no contrato não reverte a venda.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { persistGeneratedContractHtml, buildFreshSaleContractHtml } from '@/lib/contractRegeneration';
import {
  assessGeneratedContractViability,
  assertGeneratedContractViable,
} from '@/lib/contractGenerationGuard';
import { parseCurrencyBRLNumber } from '@/lib/currencyBrl';
import { resolveFinancialAccountForSaleOptional } from '@/lib/finance/companyFinancialAccountResolver';
import {
  BALLOON_MIGRATION_REQUIRED_MESSAGE,
  resolveSaleBalloonPlan,
  validateSaleBalloonConfiguration,
  type SaleBalloonFormConfig,
} from '@/lib/saleBalloonInstallments';
import {
  balloonSalesPatchFromPlan,
  probeBalloonSchemaAvailable,
  replaceSaleBalloonInstallments,
} from '@/lib/saleBalloonRepository';
import {
  downPaymentReducesInstallmentBase,
  resolveInstallmentPrincipal,
} from '@/lib/saleInstallmentCalc';
import { resolveSalePaymentMode } from '@/lib/salePaymentMode';
import { getNextContractNumber, isValidStoredContractNumber } from '@/lib/contractNumber';
import { resolveOrCreateCustomer } from '@/lib/customerIdentity';
import { parseValidatedInstallmentsCount } from '@/lib/installmentsCount';
import { buildSaleSpouseDbPatch } from '@/lib/saleSpouseFields';
import {
  DEFAULT_INSTALLMENT_CORRECTION_TYPE,
  normalizeInstallmentCorrectionType,
} from '@/lib/installmentCorrectionType';
import { buildSaleEditFinancePayloads } from '@/lib/saleEditFinanceRecalc';
import {
  assertSaleContractModelConfigured,
} from '@/lib/contractModel';
import { buildRecantoInstallmentSalesSnapshot } from '@/lib/recantoFixedInstallmentPlan';
import {
  buildCommissionSnapshotFields,
  resolveSaleCommissionPlan,
  shouldCreatePendingCommissionFromPlan,
} from '@/lib/brokerCommissionMode';

const CONTRACT_GENERATION_TIMEOUT_MS = 25_000;

export type GisSaleCreateInput = {
  userId: string;
  userRole: string;
  tenantId: string;
  projectId: string;
  lot: {
    id: string;
    block?: string | null;
    block_name?: string | null;
    lot_block?: string | null;
    number?: string | null;
    lot_number?: string | null;
    project_id?: string | null;
    tenant_id?: string | null;
    projects?: { name?: string | null } | null;
  };
  finalPrice: number;
  customerData: Record<string, unknown>;
  brokerId: string | null;
  tenantContractModel?: string | null;
  isSuperAdmin?: boolean;
  financialAccountId?: string | null;
};

export type GisSaleCreateResult = {
  success: true;
  saleId: string;
  customerId: string;
  contractId: string | null;
  warnings: string[];
};

function logSaleStep(
  step: string,
  startedAt: number,
  extra?: Record<string, unknown>,
) {
  console.log('[sales/create]', step, {
    ms: Date.now() - startedAt,
    ...extra,
  });
}

async function withTimeout<T>(
  label: string,
  ms: number,
  fn: () => Promise<T>,
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Tempo esgotado na etapa: ${label}`)),
        ms,
      );
    }),
  ]);
}

function parseMissingColumn(message: string | undefined): string | null {
  if (!message) return null;
  const match = message.match(/Could not find the '(\w+)' column/i);
  return match?.[1] ?? null;
}

async function insertRowWithColumnFallback(
  supabase: SupabaseClient,
  table: string,
  payload: Record<string, unknown>,
  select = 'id',
): Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }> {
  let current = { ...payload };

  while (Object.keys(current).length > 0) {
    const { data, error } = await supabase
      .from(table)
      .insert([current])
      .select(select)
      .single();

    if (!error && data) {
      return { data: data as Record<string, unknown>, error: null };
    }

    const missingCol = parseMissingColumn(error?.message);
    if (missingCol && missingCol in current) {
      const { [missingCol]: _removed, ...rest } = current;
      current = rest;
      continue;
    }

    return { data: null, error: error ?? { message: `Falha ao inserir em ${table}.` } };
  }

  return { data: null, error: { message: `Nenhum campo válido para inserir em ${table}.` } };
}

/**
 * Insert em lote com o mesmo fallback de coluna ausente do insert unitário.
 * Usado para finance_receipts (160–300 parcelas) — evita N round-trips e gravação parcial
 * no meio do cronograma. Sem RPC/transação nova: ainda depende de rollbackPartialSale
 * no catch externo se a operação falhar após a venda já criada.
 *
 * @returns operations = quantidade de chamadas .insert() (1 para até chunkSize rows).
 */
export async function insertRowsWithColumnFallback(
  supabase: SupabaseClient,
  table: string,
  payloads: Record<string, unknown>[],
  select = 'id',
  options?: { chunkSize?: number },
): Promise<{
  data: Record<string, unknown>[];
  error: { message?: string } | null;
  operations: number;
}> {
  if (!payloads.length) {
    return { data: [], error: null, operations: 0 };
  }

  // 300 rows ≪ limite prático PostgREST; um lote único (como importação de vendas).
  const chunkSize = Math.max(
    1,
    Math.min(options?.chunkSize ?? payloads.length, payloads.length),
  );
  let template = { ...payloads[0] };
  const allInserted: Record<string, unknown>[] = [];
  let operations = 0;

  for (let offset = 0; offset < payloads.length; offset += chunkSize) {
    const slice = payloads.slice(offset, offset + chunkSize);
    let attemptKeys = Object.keys(template);

    while (attemptKeys.length > 0) {
      const batch = slice.map((row) => {
        const next: Record<string, unknown> = {};
        for (const key of attemptKeys) {
          if (key in row) next[key] = row[key];
        }
        return next;
      });

      const { data, error } = await supabase.from(table).insert(batch).select(select);
      operations += 1;

      if (!error && data) {
        allInserted.push(...(data as Record<string, unknown>[]));
        template = batch[0] ?? template;
        break;
      }

      const missingCol = parseMissingColumn(error?.message);
      if (missingCol && attemptKeys.includes(missingCol)) {
        attemptKeys = attemptKeys.filter((k) => k !== missingCol);
        continue;
      }

      return {
        data: allInserted,
        error: error ?? { message: `Falha ao inserir em ${table}.` },
        operations,
      };
    }

    if (attemptKeys.length === 0) {
      return {
        data: allInserted,
        error: { message: `Nenhum campo válido para inserir em ${table}.` },
        operations,
      };
    }
  }

  return { data: allInserted, error: null, operations };
}

/** Estimativa de bytes JSON do payload de parcelas (diagnóstico de tamanho). */
export function estimateFinanceReceiptsPayloadBytes(
  payloads: Record<string, unknown>[],
): number {
  try {
    return Buffer.byteLength(JSON.stringify(payloads), 'utf8');
  } catch {
    return payloads.length * 512;
  }
}

async function loadProjectSnapshotForSale(
  supabase: SupabaseClient,
  projectId: string,
): Promise<Record<string, unknown> | null> {
  const withContractModel = await supabase
    .from('projects')
    .select('id, name, city, uf, forum_city, financial_account_id, contract_model')
    .eq('id', projectId)
    .maybeSingle();

  if (!withContractModel.error) {
    return (withContractModel.data as Record<string, unknown> | null) ?? null;
  }

  const missing = parseMissingColumn(withContractModel.error.message);
  if (missing === 'contract_model' || missing === 'financial_account_id') {
    const withAccount = await supabase
      .from('projects')
      .select('id, name, city, uf, forum_city, financial_account_id')
      .eq('id', projectId)
      .maybeSingle();

    if (!withAccount.error) {
      return (withAccount.data as Record<string, unknown> | null) ?? null;
    }

    if (parseMissingColumn(withAccount.error.message) === 'financial_account_id') {
      const fallback = await supabase
        .from('projects')
        .select('id, name, city, uf, forum_city')
        .eq('id', projectId)
        .maybeSingle();
      if (fallback.error) throw new Error(fallback.error.message);
      return (fallback.data as Record<string, unknown> | null) ?? null;
    }

    throw new Error(withAccount.error.message);
  }

  throw new Error(withContractModel.error.message);
}

async function insertContractForSale(
  supabase: SupabaseClient,
  payloads: Record<string, unknown>[],
): Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }> {
  let lastError: { message?: string } | null = null;

  for (let i = 0; i < payloads.length; i++) {
    const payload = payloads[i];
    const cleaned = Object.fromEntries(
      Object.entries(payload).filter(([, v]) => v !== undefined),
    );

    const { data, error } = await supabase
      .from('contracts')
      .insert([cleaned])
      .select('id, contract_number, generated_html, sale_id')
      .single();

    if (!error && data) {
      return { data: data as Record<string, unknown>, error: null };
    }

    lastError = error;
    const missingCol = error?.message?.match(/Could not find the '(\w+)' column/i)?.[1];
    if (missingCol && missingCol in cleaned) {
      const { [missingCol]: _removed, ...withoutCol } = cleaned;
      const retry = await supabase
        .from('contracts')
        .insert([withoutCol])
        .select('id, contract_number, generated_html, sale_id')
        .single();
      if (!retry.error && retry.data) {
        return { data: retry.data as Record<string, unknown>, error: null };
      }
      lastError = retry.error;
    }
  }

  return { data: null, error: lastError };
}

async function rollbackPartialSale(
  supabase: SupabaseClient,
  params: {
    saleId?: string | null;
    contractId?: string | null;
    lotId: string;
  },
) {
  if (params.saleId) {
    await supabase.from('sale_balloon_installments').delete().eq('sale_id', params.saleId);
    await supabase.from('finance_receipts').delete().eq('sale_id', params.saleId);
    await supabase.from('broker_commissions').delete().eq('sale_id', params.saleId);
    await supabase.from('sales').delete().eq('id', params.saleId);
  }
  if (params.contractId) {
    await supabase.from('contracts').delete().eq('id', params.contractId);
  }
  await supabase
    .from('blocks')
    .update({
      status: 'Disponível',
      customer_id: null,
      sale_id: null,
      contract_id: null,
      broker_id: null,
    })
    .eq('id', params.lotId);
}

export async function executeGisSaleCreate(
  supabase: SupabaseClient,
  input: GisSaleCreateInput,
): Promise<GisSaleCreateResult> {
  const startedAt = Date.now();
  const warnings: string[] = [];
  let saleId: string | null = null;
  let contractId: string | null = null;

  logSaleStep('validate_payload', startedAt);

  const { tenantId, projectId, lot, finalPrice, customerData, brokerId } = input;
  const lotId = lot.id;

  const { data: blockRow, error: blockLoadErr } = await supabase
    .from('blocks')
    .select('id, status, sale_id, tenant_id, project_id')
    .eq('id', lotId)
    .maybeSingle();

  if (blockLoadErr || !blockRow) {
    throw new Error(blockLoadErr?.message || 'Lote não encontrado.');
  }

  const blockStatus = String(blockRow.status || '').toLowerCase();
  if (
    blockRow.sale_id &&
    (blockStatus === 'vendido' || blockStatus === 'sold')
  ) {
    throw new Error('Este lote já possui venda registrada.');
  }

  logSaleStep('upsert_customer', startedAt);
  const { customerId, clientId } = await resolveOrCreateCustomer(supabase, {
    form: customerData,
    tenantId,
    projectId,
    isSuperAdmin: input.isSuperAdmin === true,
    lotTenantId: lot.tenant_id,
    changedBy: input.userId,
  });

  const projDataSnapshot = await loadProjectSnapshotForSale(supabase, projectId);

  const { data: tenantContractRow, error: tenantContractErr } = await supabase
    .from('companies')
    .select('contract_model')
    .eq('id', tenantId)
    .maybeSingle();
  if (tenantContractErr) {
    throw new Error(tenantContractErr.message || 'Falha ao carregar modelo de contrato da empresa');
  }

  const saleContractModel = assertSaleContractModelConfigured({
    projectModel: projDataSnapshot?.contract_model,
    projectName: projDataSnapshot?.name,
    companyModel: tenantContractRow?.contract_model,
    uiFallback: input.tenantContractModel,
    companyFound: Boolean(tenantContractRow),
  });

  const resolvedFinancialAccount = await resolveFinancialAccountForSaleOptional(supabase, tenantId, {
    financialAccountId: input.financialAccountId,
    projectId,
    projectFinancialAccountId: (projDataSnapshot as { financial_account_id?: string | null } | null)
      ?.financial_account_id,
  });
  const financialAccountId = resolvedFinancialAccount?.account.id ?? null;

  const pmtType = String(customerData.payment_type || 'À vista');
  const paymentMode = resolveSalePaymentMode({
    payment_type: pmtType,
    installments_count: customerData.installments_count,
  });
  const instCount = paymentMode.isInstallment
    ? parseValidatedInstallmentsCount(String(customerData.installments_count ?? ''))
    : 1;

  const recantoSignalContract =
    saleContractModel === 'RECANTO_PRIMAVERA'
      ? parseCurrencyBRLNumber(
          customerData.signal_contract_value || customerData.down_payment || '',
        )
      : null;
  const recantoSignalPaidAtSale =
    saleContractModel === 'RECANTO_PRIMAVERA' &&
    customerData.signal_paid_at_sale != null &&
    String(customerData.signal_paid_at_sale).trim() !== ''
      ? parseCurrencyBRLNumber(String(customerData.signal_paid_at_sale))
      : null;
  const recantoSignalRemaining =
    recantoSignalContract != null && recantoSignalPaidAtSale != null
      ? Math.max(0, recantoSignalContract - recantoSignalPaidAtSale)
      : null;
  const recantoSignalMode =
    saleContractModel === 'RECANTO_PRIMAVERA' &&
    recantoSignalRemaining != null &&
    recantoSignalRemaining > 0
      ? String(customerData.signal_remaining_payment_mode || 'FIRST_INSTALLMENTS')
      : null;
  const recantoSignalInstallments =
    recantoSignalMode === 'FIRST_INSTALLMENTS'
      ? Number(customerData.signal_remaining_installments) || null
      : recantoSignalMode === 'ALL_INSTALLMENTS'
        ? instCount
        : null;
  const recantoSignalInstallmentValue =
    recantoSignalRemaining != null &&
    recantoSignalInstallments &&
    recantoSignalInstallments > 0
      ? Math.round((recantoSignalRemaining / recantoSignalInstallments) * 100) / 100
      : null;

  const balloonPlan = resolveSaleBalloonPlan({
    useBalloon: Boolean(customerData.use_balloon_installments),
    installmentsCount: instCount,
    contractValue: customerData.final_value || finalPrice,
    config: (customerData.balloon_config as SaleBalloonFormConfig | null | undefined) ?? null,
  });

  if (balloonPlan.enabled) {
    if (!paymentMode.isInstallment) {
      throw new Error(
        paymentMode.isSingleFuture
          ? 'Parcelas balão não podem ser usadas em pagamento único futuro.'
          : 'Parcelas balão não podem ser usadas em venda à vista.',
      );
    }
    const schemaOk = await probeBalloonSchemaAvailable(supabase);
    if (!schemaOk) {
      throw new Error(BALLOON_MIGRATION_REQUIRED_MESSAGE);
    }
    const entryForPrincipal = parseCurrencyBRLNumber(customerData.down_payment);
    const principal = resolveInstallmentPrincipal({
      totalValue: customerData.final_value || finalPrice,
      downPayment: entryForPrincipal,
      contractModel: saleContractModel,
    });
    const balloonValidation = validateSaleBalloonConfiguration({
      plan: balloonPlan,
      paymentType: pmtType,
      installmentsCount: instCount,
      principal,
      finalValue: customerData.final_value || finalPrice,
      entryAmount: downPaymentReducesInstallmentBase(saleContractModel)
        ? entryForPrincipal
        : 0,
      firstInstallmentDueDate: customerData.first_installment_due_date,
      entryReducesPrincipal: downPaymentReducesInstallmentBase(saleContractModel),
    });
    if (!balloonValidation.valid) {
      throw new Error(balloonValidation.message);
    }
  }

  const balloonSalesFields = balloonSalesPatchFromPlan(balloonPlan);

  const recantoInstallmentSnapshot = buildRecantoInstallmentSalesSnapshot({
    contractModel: saleContractModel,
    mode: customerData.installment_definition_mode,
    lotValue: customerData.final_value || finalPrice,
    regularCount: instCount,
    regularAmount: parseCurrencyBRLNumber(
      String(customerData.regular_installment_amount || ''),
    ),
    generateResidual: customerData.generate_residual_installment !== false,
    useBalloon: balloonPlan.enabled,
  });
  if (recantoInstallmentSnapshot.error) {
    throw new Error(recantoInstallmentSnapshot.error);
  }

  const salePayload: Record<string, unknown> = {
    tenant_id: tenantId,
    company_id: tenantId,
    project_id: projectId,
    block_id: lotId,
    block_number: lot.block || lot.block_name || lot.lot_block || null,
    lot_number: lot.number || lot.lot_number || null,
    lot_id: lotId,
    customer_id: customerId,
    client_id: clientId,
    user_id: input.userId || null,
    agreed_price: customerData.final_value || finalPrice,
    lot_price: finalPrice,
    broker_id: brokerId,
    payment_type: pmtType,
    discount: parseCurrencyBRLNumber(customerData.discount_value),
    total_value: customerData.final_value || finalPrice,
    down_payment:
      recantoSignalContract ?? parseCurrencyBRLNumber(customerData.down_payment),
    installments_count: instCount,
    installment_correction_type:
      saleContractModel === 'RECANTO_PRIMAVERA'
        ? DEFAULT_INSTALLMENT_CORRECTION_TYPE
        : normalizeInstallmentCorrectionType(
            customerData.installment_correction_type,
          ),
    status: 'ACTIVE',
    signal_contract_value: recantoSignalContract,
    signal_paid_at_sale: recantoSignalPaidAtSale,
    signal_remaining_value: recantoSignalRemaining,
    signal_remaining_payment_mode: recantoSignalMode,
    signal_remaining_installments: recantoSignalInstallments,
    signal_remaining_installment_value: recantoSignalInstallmentValue,
    installment_definition_mode:
      recantoInstallmentSnapshot.installment_definition_mode,
    regular_installment_amount:
      recantoInstallmentSnapshot.regular_installment_amount,
    has_residual_installment:
      recantoInstallmentSnapshot.has_residual_installment,
    residual_installment_amount:
      recantoInstallmentSnapshot.residual_installment_amount,
    ...balloonSalesFields,
    ...(financialAccountId ? { financial_account_id: financialAccountId } : {}),
    contract_model: saleContractModel,
    ...buildSaleSpouseDbPatch(customerData),
  };

  logSaleStep('create_sale', startedAt);
  try {
    const { data: saleData, error: saleError } = await insertRowWithColumnFallback(
      supabase,
      'sales',
      salePayload,
      'id',
    );

    if (saleError || !saleData?.id) {
      throw new Error(saleError?.message || 'Falha ao criar venda');
    }
    saleId = saleData.id as string;

    if (
      customerData.update_spouse_registry === true &&
      customerData.has_spouse &&
      customerId
    ) {
      const { upsertCustomerSpouseFromSaleForm } = await import(
        '@/lib/customerSpousesService'
      );
      const registryResult = await upsertCustomerSpouseFromSaleForm(supabase, {
        companyId: tenantId,
        customerId,
        fields: customerData,
        saleId,
      });
      if (!registryResult.ok && registryResult.error) {
        warnings.push(
          `Cônjuge salvo na venda; cadastro reutilizável não atualizado: ${registryResult.error}`,
        );
      }
    }

    const contractModel = saleContractModel;

    const financePayloads = buildSaleEditFinancePayloads(
      tenantId,
      saleId,
      customerId,
      brokerId,
      { id: lotId, project_id: lot.project_id || projectId },
      customerData,
      { contractModel, cashInstallmentPaid: false, financialAccountId },
    );

    logSaleStep('create_receipts', startedAt, { count: financePayloads.length });
    if (financePayloads.length > 0) {
      const payloadBytes = estimateFinanceReceiptsPayloadBytes(financePayloads);
      logSaleStep('create_receipts_batch', startedAt, {
        count: financePayloads.length,
        approxBytes: payloadBytes,
      });
      const {
        data: insertedReceipts,
        error: financeError,
        operations,
      } = await insertRowsWithColumnFallback(
        supabase,
        'finance_receipts',
        financePayloads,
        'id, amount, due_date, status, installment_number',
      );
      logSaleStep('create_receipts_done', startedAt, {
        inserted: insertedReceipts.length,
        operations,
        approxBytes: payloadBytes,
      });
      if (financeError || insertedReceipts.length !== financePayloads.length) {
        throw new Error(
          financeError?.message ||
            `Falha ao criar parcelas (inseridas ${insertedReceipts.length}/${financePayloads.length}).`,
        );
      }
    }

    await replaceSaleBalloonInstallments(supabase, saleId, balloonPlan);

    logSaleStep('update_lot_status', startedAt, { saleId });
    const { error: blockUpdErr } = await supabase
      .from('blocks')
      .update({
        status: 'Vendido',
        price: finalPrice,
        customer_id: customerId,
        sale_id: saleId,
        contract_id: null,
        broker_id: brokerId,
      })
      .eq('id', lotId);

    if (blockUpdErr) {
      throw new Error(blockUpdErr.message || 'Falha ao marcar lote como vendido');
    }

    logSaleStep('generate_contract', startedAt);
    try {
      await withTimeout('generate_contract', CONTRACT_GENERATION_TIMEOUT_MS, async () => {
        // Após persistir venda + finance_receipts + lote, recarrega o contexto oficial
        // pelo mesmo loader da regeneração (não usa payload parcial do formulário).
        const contractNumber = await getNextContractNumber(
          supabase,
          tenantId,
          tenantId,
        );
        if (!isValidStoredContractNumber(contractNumber)) {
          throw new Error(`Número de contrato inválido: ${contractNumber}`);
        }

        const stubContract = {
          sale_id: saleId,
          customer_id: customerId,
          project_id: projectId,
          block_id: lotId,
          tenant_id: tenantId,
          company_id: tenantId,
          contract_number: contractNumber,
          contract_model: saleContractModel,
        };

        const built = await buildFreshSaleContractHtml(supabase, stubContract, {
          contractTenantId: tenantId,
          activeTenantId: tenantId,
          callerRole: String(input.userRole || 'ADMIN'),
        });

        const viability = assessGeneratedContractViability({
          html: built.html,
          sale: built.sale,
          block: built.block,
          receiptsSum: built.receipts_sum,
        });
        if (!viability.ok) {
          console.error('[sales/create] CONTRACT_GENERATION_BLOCKED', {
            saleId,
            reasons: viability.reasons,
            saleValue: viability.saleValue,
          });
          assertGeneratedContractViable(viability);
        }

        const saleValue = viability.saleValue;
        const downPaymentVal =
          Number(built.sale.down_payment) ||
          parseCurrencyBRLNumber(customerData.down_payment);

        const contractPayloads: Record<string, unknown>[] = [
          {
            tenant_id: tenantId,
            company_id: tenantId,
            sale_id: saleId,
            customer_id: customerId,
            project_id: projectId,
            block_id: lotId,
            broker_id: brokerId,
            contract_number: built.contractNumber || contractNumber,
            sale_value: saleValue,
            down_payment: downPaymentVal,
            installments: instCount,
            status: 'ativo',
            version: 1,
            is_current: true,
            needs_regenerar: false,
            generated_html: built.html,
            contract_model: saleContractModel,
            created_at: new Date().toISOString(),
            ...built.contractPayloadPartial,
          },
          {
            tenant_id: tenantId,
            company_id: tenantId,
            sale_id: saleId,
            customer_id: customerId,
            project_id: projectId,
            block_id: lotId,
            contract_number: built.contractNumber || contractNumber,
            status: 'ativo',
            version: 1,
            is_current: true,
            generated_html: built.html,
            contract_model: saleContractModel,
            ...built.contractPayloadPartial,
          },
          {
            tenant_id: tenantId,
            sale_id: saleId,
            customer_id: customerId,
            project_id: projectId,
            block_id: lotId,
            contract_number: built.contractNumber || contractNumber,
            status: 'ativo',
            generated_html: built.html,
            contract_model: saleContractModel,
          },
        ];

        const { data: insertedContract, error: contractInsertError } =
          await insertContractForSale(supabase, contractPayloads);

        if (contractInsertError || !insertedContract) {
          warnings.push(
            `Contrato não criado: ${contractInsertError?.message || 'erro desconhecido'}.`,
          );
          return;
        }

        contractId = String(insertedContract.id || '');
        if (built.html && contractId) {
          const hasHtml = Boolean(
            insertedContract.generated_html &&
              String(insertedContract.generated_html).trim().length > 0,
          );
          if (!hasHtml) {
            await persistGeneratedContractHtml(
              supabase,
              contractId,
              built.html,
              insertedContract as Record<string, unknown>,
            );
          }
        }

        if (contractId) {
          await supabase
            .from('blocks')
            .update({ contract_id: contractId })
            .eq('id', lotId);
        }
      });
    } catch (contractErr: unknown) {
      const msg =
        contractErr instanceof Error ? contractErr.message : String(contractErr);
      warnings.push(`Contrato não gerado: ${msg}`);
    }

    // Comissão: snapshot na época da venda (não depende só do role BROKER).
    if (brokerId && saleId) {
      try {
        const { data: brokerData } = await supabase
          .from('brokers')
          .select('commission_percent, commission_mode, commission_fixed_amount')
          .eq('id', brokerId)
          .maybeSingle();

        const saleVal = Number(customerData.final_value || finalPrice) || 0;
        const useDefault =
          customerData.use_broker_default_commission === undefined ||
          customerData.use_broker_default_commission === null ||
          customerData.use_broker_default_commission === true ||
          customerData.use_broker_default_commission === 'true';

        const plan = resolveSaleCommissionPlan({
          broker: brokerData,
          useBrokerDefault: Boolean(useDefault),
          saleCommissionMode: customerData.sale_commission_mode as string | null | undefined,
          saleCommissionPercent: customerData.sale_commission_percent as
            | number
            | string
            | null
            | undefined,
          saleCommissionFixedAmount: customerData.sale_commission_fixed_amount as
            | number
            | string
            | null
            | undefined,
          saleValue: saleVal,
        });

        if (shouldCreatePendingCommissionFromPlan(plan)) {
          await supabase.from('broker_commissions').insert([
            {
              company_id: tenantId,
              tenant_id: tenantId,
              broker_id: brokerId,
              sale_id: saleId,
              contract_id: contractId,
              customer_id: customerId || clientId,
              ...buildCommissionSnapshotFields(plan),
              status: 'pendente',
            },
          ]);
        }
      } catch (commErr) {
        console.warn('[sales/create] broker_commission_failed', commErr);
        warnings.push('Comissão do corretor não registrada automaticamente.');
      }
    }

    logSaleStep('response', startedAt, {
      saleId,
      contractId,
      warnings: warnings.length,
    });

    return {
      success: true,
      saleId,
      customerId,
      contractId,
      warnings,
    };
  } catch (err) {
    logSaleStep('response', startedAt, { rollback: true, error: String(err) });
    await rollbackPartialSale(supabase, {
      saleId,
      contractId,
      lotId,
    });
    throw err;
  }
}
