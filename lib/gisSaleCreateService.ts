/**
 * Criação de venda pelo GIS — core transacional com logs [sales/create].
 * O núcleo financeiro é uma transação. Falha posterior do contrato não libera o lote.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { persistGeneratedContractHtml, buildFreshSaleContractHtml } from '@/lib/contractRegeneration';
import {
  assessGeneratedContractViability,
  assertGeneratedContractViable,
} from '@/lib/contractGenerationGuard';
import { parseCurrencyBRLNumber } from '@/lib/currencyBrl';
import { resolveFinancialAccountForSaleOptional } from '@/lib/finance/companyFinancialAccountResolver';
import { type SaleInitialReceipt } from '@/lib/finance/saleInitialReceiptCash';
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
import { resolveOrCreateCustomer, customerPatchFromForm } from '@/lib/customerIdentity';
import { parseValidatedInstallmentsCount } from '@/lib/installmentsCount';
import { buyerSnapshotFromForm, isBuyerLegalEntity } from '@/lib/buyerLegalEntity';
import { buildSaleSpouseDbPatch } from '@/lib/saleSpouseFields';
import { buildSaleEditFinancePayloads } from '@/lib/saleEditFinanceRecalc';
import {
  assertSaleContractModelConfigured,
  detectPreviewAraguaiaNameCoerce,
  normalizeSaleContractModel,
} from '@/lib/contractModel';
import {
  assertLfEstrelaCorrectionCoherentWithHardcodedLegal,
  resolvePersistInstallmentCorrectionType,
  usesSplitDownPaymentFinance,
} from '@/lib/saleFinanceConfig';
import { buildSplitDownPaymentPersistFields } from '@/lib/recantoSignalRemaining';
import {
  assertLfParticipationConfiguredForNewSale,
  captureLfContractSnapshotForSale,
} from '@/lib/lfImoveisContractConfig';
import { buildTerminationPolicySnapshot } from '@/lib/contract-termination/snapshot';
import { buildRecantoInstallmentSalesSnapshot } from '@/lib/recantoFixedInstallmentPlan';
import {
  buildCommissionSnapshotFields,
  resolveSaleCommissionPlan,
  shouldCreatePendingCommissionFromPlan,
} from '@/lib/brokerCommissionMode';
import { SALE_REQUIRES_PERSISTED_CONTRACT_MESSAGE } from '@/lib/saleHistoricalContract';
import {
  invokeSaleFinancialCore,
  resolveContractRetry,
  SALE_CONTRACT_PENDING_MESSAGE,
  type CoreContractRow,
} from '@/lib/finance/saleFinancialCore';
import {
  clientRequestedSeparateSignal,
  rejectUnpersistedSeparateSignalRequest,
} from '@/lib/recantoSeparateSignalPersistence';
import { isRecantoSeparateSignalAllowed } from '@/lib/recantoSeparateSignalRuntime';
import {
  buildRecantoSeparateSaleCreate,
  requireCompleteSeparateReceipts,
  separateSignalReceiptRows,
  type SeparateSaleCreateDraft,
} from '@/lib/recantoSeparateSignalSaleCreate';

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
  callerTenantId?: string | null;
  financialAccountId?: string | null;
  saleRequestKey?: string | null;
};

export type GisSaleCreateResult = {
  success: true;
  saleId: string;
  customerId: string;
  contractId: string;
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
  const schema = message.match(/Could not find the '(\w+)' column/i);
  if (schema?.[1]) return schema[1];
  const postgres = message.match(/column (?:[\w]+\.)?["']?(\w+)["']? does not exist/i);
  return postgres?.[1] ?? null;
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
      return { data: data as unknown as Record<string, unknown>, error: null };
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
 * no meio do cronograma. A criação da venda grava venda, recebíveis, caixa e lote
 * juntos em create_sale_financial_core.
 *
 * @returns operations = quantidade de chamadas .insert() (1 para até chunkSize rows).
 */
export async function insertRowsWithColumnFallback(
  supabase: SupabaseClient,
  table: string,
  payloads: Record<string, unknown>[],
  select = 'id',
  options?: { chunkSize?: number; preserveColumns?: readonly string[] },
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
      if (missingCol && options?.preserveColumns?.includes(missingCol)) {
        return {
          data: allInserted,
          error: { message: `A coluna ${missingCol} é obrigatória para o sinal separado.` },
          operations,
        };
      }
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

async function selectSingleWithColumnFallback(
  supabase: SupabaseClient,
  table: string,
  columns: string[],
  eqColumn: string,
  eqValue: string,
): Promise<Record<string, unknown> | null> {
  let current = [...columns];
  for (let attempt = 0; attempt < 16 && current.length > 0; attempt++) {
    const { data, error } = await supabase
      .from(table)
      .select(current.join(', '))
      .eq(eqColumn, eqValue)
      .maybeSingle();
    if (!error) {
      return (data as Record<string, unknown> | null) ?? null;
    }
    const missing = parseMissingColumn(error.message);
    if (missing && current.includes(missing)) {
      current = current.filter((col) => col !== missing);
      continue;
    }
    throw new Error(error.message);
  }
  return null;
}

async function loadProjectSnapshotForSale(
  supabase: SupabaseClient,
  projectId: string,
): Promise<Record<string, unknown> | null> {
  return selectSingleWithColumnFallback(
    supabase,
    'projects',
    [
      'id',
      'name',
      'city',
      'uf',
      'forum_city',
      'neighborhood',
      'address',
      'financial_account_id',
      'contract_model',
      'lf_contract_config_json',
    ],
    'id',
    projectId,
  );
}

async function loadCompanyForLfSnapshot(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<Record<string, unknown> | null> {
  return selectSingleWithColumnFallback(
    supabase,
    'companies',
    ['id', 'contract_model', 'contract_second_vendor_json', 'name', 'razao_social', 'fantasy_name'],
    'id',
    tenantId,
  );
}

async function persistSaleContractLink(
  supabase: SupabaseClient,
  saleId: string,
  contractId: string,
) {
  const { error } = await supabase
    .from('sales')
    .update({ contract_id: contractId })
    .eq('id', saleId);
  if (error) {
    throw new Error(
      error.message || 'Não foi possível gravar sales.contract_id nesta venda.',
    );
  }
}

/** Sempre INSERT de contrato novo da venda. Nunca UPDATE/reuso por block_id. */
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
      return { data: data as unknown as Record<string, unknown>, error: null };
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

function rememberInitialReceipts(
  rows: Array<Record<string, unknown>>,
  tenantId: string,
  saleId: string,
): SaleInitialReceipt[] {
  return rows.map((row) => ({
    id: String(row.id || ''),
    tenantId: String(row.tenant_id || tenantId),
    companyId: String(row.company_id || tenantId),
    saleId: String(row.sale_id || saleId),
    amount: Number(row.amount) || 0,
    paidAmount: row.paid_amount == null || String(row.paid_amount).trim() === ''
      ? null
      : Number(row.paid_amount),
    status: row.status == null ? null : String(row.status),
    installmentNumber: row.installment_number as number | string | null,
    scheduleGroup: row.schedule_group == null ? null : String(row.schedule_group),
    projectId: row.project_id == null ? null : String(row.project_id),
    customerId: row.customer_id == null ? null : String(row.customer_id),
  }));
}

export async function executeGisSaleCreate(
  supabase: SupabaseClient,
  input: GisSaleCreateInput,
): Promise<GisSaleCreateResult> {
  const startedAt = Date.now();
  const warnings: string[] = [];
  let saleId: string | null = null;
  let contractId: string | null = null;
  let persistedContractNumber: string | null = null;
  let initialReceipts: SaleInitialReceipt[] = [];

  logSaleStep('validate_payload', startedAt);

  const { tenantId, projectId, lot, finalPrice, customerData, brokerId } = input;
  rejectUnpersistedSeparateSignalRequest(customerData, process.env, {
    companyId: tenantId,
    projectId,
  });
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

  if (clientRequestedSeparateSignal(customerData)) {
    const callerTenant = String(input.callerTenantId || '').trim();
    const lotTenant = String(blockRow.tenant_id || '').trim();
    if (input.isSuperAdmin !== true && callerTenant !== tenantId) {
      throw new Error('A confirmação pertence a outra empresa.');
    }
    if (lotTenant !== tenantId) {
      throw new Error('A confirmação pertence a outra empresa.');
    }
  }

  logSaleStep('upsert_customer', startedAt);
  const { customerId, clientId } = await resolveOrCreateCustomer(supabase, {
    form: customerData,
    tenantId,
    projectId,
    isSuperAdmin: input.isSuperAdmin === true,
    lotTenantId: lot.tenant_id,
    changedBy: input.userId,
    requireOwnedCustomer: clientRequestedSeparateSignal(customerData),
  });

  const projDataSnapshot = await loadProjectSnapshotForSale(supabase, projectId);

  const tenantCompanyRow = await loadCompanyForLfSnapshot(supabase, tenantId);
  const tenantContractRow = tenantCompanyRow;
  if (!tenantContractRow) {
    throw new Error('Falha ao carregar modelo de contrato da empresa');
  }

  const saleContractModel = assertSaleContractModelConfigured({
    projectModel: projDataSnapshot?.contract_model,
    projectName: projDataSnapshot?.name,
    companyModel: tenantContractRow?.contract_model,
    uiFallback: input.tenantContractModel,
    companyFound: Boolean(tenantContractRow),
  });
  if (normalizeSaleContractModel(saleContractModel) === 'ESTRELA_DO_SUL') {
    assertLfParticipationConfiguredForNewSale(projDataSnapshot);
  }

  const nameCoerce = detectPreviewAraguaiaNameCoerce({
    projectName: projDataSnapshot?.name,
    projectModel: projDataSnapshot?.contract_model,
  });
  if (nameCoerce) {
    warnings.push(
      'Modelo ARAGUAIA gravado explicitamente nesta venda a partir do nome do empreendimento (Preview).',
    );
  }
  const terminationPersist = buildTerminationPolicySnapshot({
    contractModel: saleContractModel,
    persistSource: 'catalog',
    warnings: nameCoerce
      ? [
          'Modelo ARAGUAIA gravado explicitamente a partir do nome do empreendimento (Preview).',
        ]
      : undefined,
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

  const splitDownPayment = usesSplitDownPaymentFinance({
    contractModel: saleContractModel,
    projectLfConfig: projDataSnapshot?.lf_contract_config_json,
  });
  const recantoSignalContract = splitDownPayment
    ? parseCurrencyBRLNumber(
        customerData.signal_contract_value || customerData.down_payment || '',
      )
    : null;
  const recantoSignalPaidAtSale =
    splitDownPayment &&
    customerData.signal_paid_at_sale != null &&
    String(customerData.signal_paid_at_sale).trim() !== ''
      ? parseCurrencyBRLNumber(String(customerData.signal_paid_at_sale))
      : null;
  const splitPersist = buildSplitDownPaymentPersistFields({
    enabled: splitDownPayment,
    contractValue: recantoSignalContract,
    paidAtSale: recantoSignalPaidAtSale,
    paymentMode: String(customerData.signal_remaining_payment_mode || ''),
    remainingInstallments: Number(customerData.signal_remaining_installments) || null,
    installmentsCount: instCount,
  });

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
      downPayment: splitDownPayment
        ? recantoSignalContract ?? entryForPrincipal
        : entryForPrincipal,
      contractModel: saleContractModel,
    });
    const balloonValidation = validateSaleBalloonConfiguration({
      plan: balloonPlan,
      paymentType: pmtType,
      installmentsCount: instCount,
      principal,
      finalValue: customerData.final_value || finalPrice,
      entryAmount:
        splitDownPayment || !downPaymentReducesInstallmentBase(saleContractModel)
          ? 0
          : entryForPrincipal,
      firstInstallmentDueDate: customerData.first_installment_due_date,
      entryReducesPrincipal:
        !splitDownPayment &&
        downPaymentReducesInstallmentBase(saleContractModel),
    });
    if (!balloonValidation.valid) {
      throw new Error(balloonValidation.message);
    }
  }

  const balloonSalesFields = balloonSalesPatchFromPlan(balloonPlan);

  const recantoInstallmentSnapshot = buildRecantoInstallmentSalesSnapshot({
    contractModel: saleContractModel,
    mode: customerData.installment_definition_mode,
    lotValue: resolveInstallmentPrincipal({
      totalValue: customerData.final_value || finalPrice,
      downPayment:
        recantoSignalContract ?? parseCurrencyBRLNumber(customerData.down_payment),
      contractModel: saleContractModel,
    }),
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

  const installmentCorrectionType = resolvePersistInstallmentCorrectionType({
    contractModel: saleContractModel,
    selected: customerData.installment_correction_type,
    projectLfConfig: projDataSnapshot?.lf_contract_config_json,
  });
  assertLfEstrelaCorrectionCoherentWithHardcodedLegal(
    saleContractModel,
    installmentCorrectionType,
  );

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
      splitPersist.downPaymentOverride ?? parseCurrencyBRLNumber(customerData.down_payment),
    installments_count: instCount,
    installment_correction_type: installmentCorrectionType,
    status: 'ACTIVE',
    signal_contract_value: splitPersist.signalContractValue,
    signal_paid_at_sale: splitPersist.signalPaidAtSale,
    signal_remaining_value: splitPersist.signalRemainingValue,
    signal_remaining_payment_mode: splitPersist.signalRemainingPaymentMode,
    signal_remaining_installments: splitPersist.signalRemainingInstallments,
    signal_remaining_installment_value: splitPersist.signalRemainingInstallmentValue,
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
    ...terminationPersist,
    ...buildSaleSpouseDbPatch(
      isBuyerLegalEntity(String(customerData.cpf_cnpj || '')) ? { has_spouse: false } : customerData,
    ),
    ...buyerSnapshotFromForm(customerData),
    ...(normalizeSaleContractModel(saleContractModel) === 'ESTRELA_DO_SUL'
      ? {
          lf_contract_snapshot_json: captureLfContractSnapshotForSale({
            project: projDataSnapshot,
            company: tenantContractRow,
          }),
        }
      : {}),
  };

  const separateDraft: SeparateSaleCreateDraft | null =
    clientRequestedSeparateSignal(customerData) && isRecantoSeparateSignalAllowed(tenantId, projectId)
      ? buildRecantoSeparateSaleCreate(customerData, {
          tenantId,
          customerId,
          projectId,
          blockId: lotId,
          financialAccountId,
          brokerId,
          lotPrice: Number(customerData.final_value || finalPrice),
          contractModel: saleContractModel,
        })
      : null;
  if (separateDraft && balloonPlan.enabled) {
    throw new Error('Parcelas balão não podem ser usadas com o sinal separado.');
  }
  if (separateDraft) {
    Object.assign(salePayload, separateDraft.saleFields);
    salePayload.separate_signal_request_key = input.saleRequestKey;
  }

  const receiptPayloads: Array<Record<string, unknown>> = separateDraft
    ? separateSignalReceiptRows(separateDraft, {
        saleId: '00000000-0000-0000-0000-000000000000',
        tenantId,
        customerId,
        projectId,
        blockId: lotId,
        brokerId,
        financialAccountId,
      })
    : buildSaleEditFinancePayloads(
        tenantId,
        '00000000-0000-0000-0000-000000000000',
        customerId,
        brokerId,
        { id: lotId, project_id: lot.project_id || projectId },
        customerData,
        { contractModel: saleContractModel, cashInstallmentPaid: false, financialAccountId },
      );
  if (separateDraft) {
    requireCompleteSeparateReceipts(separateDraft.plan.receipts.length, receiptPayloads.length);
  }

  logSaleStep('create_sale', startedAt);
  try {
    logSaleStep('create_receipts', startedAt, { count: receiptPayloads.length });
    logSaleStep('create_receipts_batch', startedAt, { count: receiptPayloads.length });
    const financialCore = await invokeSaleFinancialCore(supabase, {
      sale: salePayload,
      receipts: receiptPayloads,
      requestKey: String(input.saleRequestKey || ''),
      userId: input.userId,
    });
    saleId = financialCore.saleId;
    initialReceipts = rememberInitialReceipts(financialCore.receipts, tenantId, saleId);
    if (financialCore.contractId) contractId = financialCore.contractId;
    logSaleStep('update_lot_status', startedAt, { saleId, replayed: financialCore.replayed });

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

    await replaceSaleBalloonInstallments(supabase, saleId, balloonPlan);

    // Snapshot de comissão ANTES do HTML do contrato, para o modelo consumir
    // broker_commissions.amount da venda (não a config atual do corretor).
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
          const { data: insertedCommission, error: commissionInsertError } =
            await insertRowWithColumnFallback(
              supabase,
              'broker_commissions',
              {
                company_id: tenantId,
                tenant_id: tenantId,
                broker_id: brokerId,
                sale_id: saleId,
                customer_id: customerId || clientId,
                ...buildCommissionSnapshotFields(plan),
                status: 'pendente',
              },
              'id, amount, commission_fixed_amount',
            );
          if (commissionInsertError || !insertedCommission) {
            console.warn(
              '[sales/create] broker_commission_failed',
              commissionInsertError,
            );
            warnings.push('Comissão do corretor não registrada automaticamente.');
          }
        }
      } catch (commErr) {
        console.warn('[sales/create] broker_commission_failed', commErr);
        warnings.push('Comissão do corretor não registrada automaticamente.');
      }
    }

    logSaleStep('generate_contract', startedAt);
    try {
      if (!contractId && saleId) {
        const { data: existingContracts, error: existingContractError } = await supabase
          .from('contracts')
          .select('id, sale_id, tenant_id, is_current, contract_number')
          .eq('sale_id', saleId)
          .eq('tenant_id', tenantId);
        if (existingContractError) {
          throw new Error(existingContractError.message || 'Falha ao localizar o contrato da venda.');
        }
        const decision = resolveContractRetry(
          saleId,
          tenantId,
          ((existingContracts || []) as Array<Record<string, unknown>>).map((row) => ({
            id: String(row.id || ''),
            saleId: String(row.sale_id || ''),
            tenantId: String(row.tenant_id || ''),
            current: row.is_current !== false,
          } satisfies CoreContractRow)),
        );
        if (decision.action === 'reuse' && decision.contractId) {
          contractId = decision.contractId;
          const reused = (existingContracts || []).find((row) => String((row as { id?: string }).id) === contractId);
          persistedContractNumber = reused
            ? String((reused as { contract_number?: string }).contract_number || '') || null
            : null;
        }
      }
      if (!contractId) await withTimeout('generate_contract', CONTRACT_GENERATION_TIMEOUT_MS, async () => {
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
          customerFormOverlay: customerPatchFromForm(
            customerData as { name?: string; nationality?: string },
          ),
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
            ...terminationPersist,
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
            ...terminationPersist,
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
            ...terminationPersist,
          },
        ];

        const { data: insertedContract, error: contractInsertError } =
          await insertContractForSale(supabase, contractPayloads);

        if (contractInsertError || !insertedContract) {
          throw new Error(
            contractInsertError?.message || 'Falha ao persistir o contrato da venda.',
          );
        }

        contractId = String(insertedContract.id || '').trim();
        persistedContractNumber = String(insertedContract.contract_number || contractNumber).trim() || null;
        if (!contractId) {
          throw new Error('Contrato persistido sem identificador.');
        }

        if (built.html) {
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

        await persistSaleContractLink(supabase, saleId, contractId);
      });
    } catch (contractErr: unknown) {
      const msg =
        contractErr instanceof Error ? contractErr.message : String(contractErr);
      throw new Error(`${saleId ? SALE_CONTRACT_PENDING_MESSAGE : SALE_REQUIRES_PERSISTED_CONTRACT_MESSAGE} ${msg}`);
    }

    if (!contractId || !saleId) {
      throw new Error(saleId ? SALE_CONTRACT_PENDING_MESSAGE : SALE_REQUIRES_PERSISTED_CONTRACT_MESSAGE);
    }

    await persistSaleContractLink(supabase, saleId, contractId);

    const { data: linkedLot, error: blockUpdErr } = await supabase
      .from('blocks')
      .update({ contract_id: contractId })
      .eq('id', lotId)
      .eq('sale_id', saleId)
      .select('id');

    if (blockUpdErr || !linkedLot?.length) {
      throw new Error(blockUpdErr?.message || SALE_CONTRACT_PENDING_MESSAGE);
    }

    if (saleId && contractId) {
      try {
        await supabase
          .from('broker_commissions')
          .update({ contract_id: contractId })
          .eq('sale_id', saleId)
          .is('contract_id', null);
      } catch (linkErr) {
        console.warn('[sales/create] broker_commission_contract_link_failed', linkErr);
      }
    }


    if (!contractId) {
      throw new Error(SALE_REQUIRES_PERSISTED_CONTRACT_MESSAGE);
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
    logSaleStep('response', startedAt, {
      financialCoreCommitted: Boolean(saleId),
      lotReleased: false,
      error: String(err),
    });
    throw err;
  }
}
