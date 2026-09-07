/**
 * P4 — execução local da Transferência de titularidade.
 * Gera HTML via generateContractHTML e chama a RPC execute_sale_title_transfer.
 * Sem Asaas/Inter generate. Sem ReleaseLot. Sem RPC da Troca.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getNextContractNumber, isValidStoredContractNumber } from '@/lib/contractNumber';
import {
  assessGeneratedContractViability,
  assertGeneratedContractViable,
} from '@/lib/contractGenerationGuard';
import {
  applyEffectiveContractModelToTenant,
  isRecantoPrimaveraContractModel,
  resolveSaleContractModelFromContext,
} from '@/lib/contractModel';
import { generateContractHTML } from '@/lib/contractTemplate';
import {
  enrichBlockForContract,
  loadFreshRegenerationEntities,
  loadSaleContractContext,
  type RegenerationSession,
} from '@/lib/contractRegeneration';
import { SALE_TITLE_TRANSFER_TABLE } from '@/lib/finance/saleTitleTransfer';
import { buildTitleTransferContractFinanceContext } from '@/lib/finance/saleTitleTransferContractContext';
import {
  buildTitleTransferIdempotencyKey,
  parseTitleTransferExecuteRpcError,
  TITLE_TRANSFER_EXECUTE_RPC,
  TITLE_TRANSFER_TITULAR_CHANGED,
  type TitleTransferExecuteRpcPayload,
  type TitleTransferExecuteRpcResult,
} from '@/lib/finance/saleTitleTransferExecute';
import {
  isTitleTransferCanceledReceipt,
  isTitleTransferPaidReceipt,
  TITLE_TRANSFER_CROSS_TENANT,
  TITLE_TRANSFER_ORIGIN_MISMATCH,
  mapTitleTransferPreviewUserMessage,
} from '@/lib/finance/saleTitleTransferPreview';
import { loadLotSwapCallerProfile } from '@/lib/finance/saleLotSwapPreviewService';
import { TitleTransferPreviewError } from '@/lib/finance/saleTitleTransferPreviewService';
import { assertTitleTransferCallerOwnsCompany } from '@/lib/finance/saleTitleTransferPreview';
import { embedRecantoContractSignatureInHtml } from '@/lib/recantoPrimaveraContractAssets';
import { assertCustomerValidForContract } from '@/lib/validateCustomerForContract';
import { assertContractNumberNotReused } from '@/lib/finance/saleLotSwapExecute';
import type { TitleTransferFinanceKpis } from '@/lib/finance/saleTitleTransferPreview';

export { TitleTransferPreviewError };

function text(v: unknown): string {
  return String(v ?? '').trim();
}

function money2(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

export type TitleTransferExecutedResult = {
  mutation: true;
  execute: true;
  persistTransfer: true;
  generateCharges: false;
  reused: boolean;
  status: 'EXECUTED';
  transferId: string;
  saleId: string;
  blockId: string;
  fromCustomerId: string;
  toCustomerId: string;
  fromContractId: string | null;
  toContractId: string | null;
  toContractNumber: string | null;
  previousTransferId: string | null;
  saleIdUnchanged: true;
  blockIdUnchanged: true;
  lotStillSold: true;
  receiptsPreserved: true;
};

async function buildTitleTransferReplacementContractHtml(
  admin: SupabaseClient,
  input: {
    saleId: string;
    companyId: string;
    toCustomerId: string;
    fromContractId: string | null;
    blockId: string;
    contractNumber: string;
    salePrice: number;
    finance: TitleTransferFinanceKpis;
    declaredAgioAmount: number;
    remainingInstallments: Array<{
      installment_number?: number | null;
      amount?: number | string | null;
      due_date?: string | null;
    }>;
    callerRole: string;
  },
): Promise<{
  html: string;
  contractNumber: string;
  contractModel: string | null;
  snapshots: {
    project_name_snapshot: string | null;
    project_city_snapshot: string | null;
    project_uf_snapshot: string | null;
    forum_city_snapshot: string | null;
  };
}> {
  const session: RegenerationSession = {
    contractTenantId: input.companyId,
    activeTenantId: input.companyId,
    callerRole: input.callerRole || 'ADMIN',
  };
  let sourceContract: Record<string, unknown> = {
    sale_id: input.saleId,
    customer_id: input.toCustomerId,
    block_id: input.blockId,
    tenant_id: input.companyId,
    company_id: input.companyId,
    contract_number: input.contractNumber,
  };
  if (input.fromContractId) {
    const loaded = await loadSaleContractContext(admin, input.fromContractId);
    sourceContract = {
      ...loaded,
      id: loaded.id,
      sale_id: input.saleId,
      customer_id: input.toCustomerId,
      block_id: input.blockId,
      contract_number: input.contractNumber,
    };
  }
  const fresh = await loadFreshRegenerationEntities(admin, sourceContract, session);
  const contractFinance = buildTitleTransferContractFinanceContext({
    salePrice: input.salePrice,
    finance: input.finance,
    declaredAgioAmount: input.declaredAgioAmount,
    remainingInstallments: input.remainingInstallments,
  });
  const saleWithPatch: Record<string, unknown> = {
    ...fresh.sale,
    id: input.saleId,
    customer_id: input.toCustomerId,
    block_id: input.blockId,
    lot_id: input.blockId,
    ...contractFinance.salePatch,
    finance_receipts: contractFinance.financeReceipts,
  };
  const destBlock = enrichBlockForContract({
    ...fresh.block,
    id: input.blockId,
  });
  const effectiveModel = resolveSaleContractModelFromContext({
    saleModel: saleWithPatch.contract_model,
    contractModel: sourceContract.contract_model,
    projectModel: fresh.project.contract_model,
    projectName: fresh.project.name,
    companyModel: fresh.company.contract_model,
  });
  const tenant = applyEffectiveContractModelToTenant(
    { ...fresh.company, id: input.companyId },
    effectiveModel.model,
  );
  const customer = {
    ...fresh.customer,
    id: input.toCustomerId,
  };
  assertCustomerValidForContract(customer);
  const snapshots = {
    project_name_snapshot: text(fresh.project.name) || null,
    project_city_snapshot: text(fresh.project.city) || null,
    project_uf_snapshot: text(fresh.project.uf) || null,
    forum_city_snapshot: text(fresh.project.forum_city) || text(fresh.project.city) || null,
  };
  let html = generateContractHTML({
    tenant,
    customer,
    project: fresh.project,
    block: destBlock,
    sale: saleWithPatch,
    financeReceipts: contractFinance.financeReceipts,
    balloonAddons: [],
    contractSnapshot: {
      contract_number: input.contractNumber,
      ...snapshots,
    },
    projectBlocks: fresh.projectBlocks,
    streetGuides: fresh.streetGuides,
    manualConfrontants: null,
  });
  if (isRecantoPrimaveraContractModel(tenant)) {
    html = await embedRecantoContractSignatureInHtml(html, tenant);
  }
  const viability = assessGeneratedContractViability({
    html,
    sale: saleWithPatch,
    block: destBlock,
    receiptsSum: money2(input.salePrice),
  });
  if (!viability.ok) {
    console.error('[title-transfer execute] CONTRACT_HTML_FAILED', viability.reasons);
    assertGeneratedContractViable(viability);
  }
  return {
    html,
    contractNumber: input.contractNumber,
    contractModel: effectiveModel.model ? String(effectiveModel.model) : null,
    snapshots,
  };
}

export async function executeSaleTitleTransfer(
  admin: SupabaseClient,
  input: {
    saleId: string;
    userId: string;
    transferId?: string | null;
    idempotencyKey?: string | null;
    callerRole?: string | null;
    finance: TitleTransferFinanceKpis;
    salePrice: number;
    declaredAgioAmount: number;
    remainingInstallments: Array<{
      installment_number?: number | null;
      amount?: number | string | null;
      due_date?: string | null;
      financial_account_id?: string | null;
    }>;
    cancelReceiptIds: string[];
  },
): Promise<TitleTransferExecutedResult> {
  const saleId = text(input.saleId);
  if (!saleId) {
    throw new TitleTransferPreviewError('saleId obrigatório.', 'SALE_ID_REQUIRED', 400);
  }
  if (!text(input.userId)) {
    throw new TitleTransferPreviewError(
      'Sessão ou autorização inválida.',
      'UNAUTHORIZED',
      401,
    );
  }
  const profile = await loadLotSwapCallerProfile(admin, text(input.userId));
  if (!profile) {
    throw new TitleTransferPreviewError(
      'Sessão ou autorização inválida.',
      'NO_PROFILE',
      403,
    );
  }
  const callerTenant = text(
    profile.tenant_id || (profile as { company_id?: string }).company_id,
  );
  const callerRole = text(profile.role || input.callerRole);

  let loaded = text(input.transferId)
    ? await admin
        .from(SALE_TITLE_TRANSFER_TABLE)
        .select('*')
        .eq('id', text(input.transferId))
        .eq('sale_id', saleId)
        .maybeSingle()
    : await admin
        .from(SALE_TITLE_TRANSFER_TABLE)
        .select('*')
        .eq('sale_id', saleId)
        .in('status', ['CALCULATED', 'EXECUTING'])
        .maybeSingle();
  if (!text(input.transferId) && !loaded.error && !loaded.data) {
    loaded = await admin
      .from(SALE_TITLE_TRANSFER_TABLE)
      .select('*')
      .eq('sale_id', saleId)
      .eq('status', 'EXECUTED')
      .order('executed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
  }
  if (loaded.error || !loaded.data) {
    throw new TitleTransferPreviewError(
      'Confirme o plano CALCULATED antes de executar a transferência.',
      'NOT_CALCULATED',
      409,
    );
  }
  const row = loaded.data as Record<string, unknown>;
  const companyId = text(row.company_id || row.tenant_id);
  const tenantGuard = assertTitleTransferCallerOwnsCompany({
    callerTenantId: callerTenant,
    resourceCompanyId: companyId,
    callerRole,
  });
  if (!tenantGuard.ok) {
    throw new TitleTransferPreviewError(
      mapTitleTransferPreviewUserMessage({ code: TITLE_TRANSFER_CROSS_TENANT }),
      TITLE_TRANSFER_CROSS_TENANT,
      403,
    );
  }
  const status = text(row.status);
  if (status === 'EXECUTED') {
    return {
      mutation: true,
      execute: true,
      persistTransfer: true,
      generateCharges: false,
      reused: true,
      status: 'EXECUTED',
      transferId: String(row.id),
      saleId,
      blockId: String(row.block_id || ''),
      fromCustomerId: String(row.from_customer_id || ''),
      toCustomerId: String(row.to_customer_id || ''),
      fromContractId: row.from_contract_id ? String(row.from_contract_id) : null,
      toContractId: row.to_contract_id ? String(row.to_contract_id) : null,
      toContractNumber: null,
      previousTransferId: row.previous_transfer_id ? String(row.previous_transfer_id) : null,
      saleIdUnchanged: true,
      blockIdUnchanged: true,
      lotStillSold: true,
      receiptsPreserved: true,
    };
  }
  if (status === 'EXECUTING') {
    throw new TitleTransferPreviewError(
      'Já existe uma transferência em execução para esta venda.',
      'EXECUTING_IN_PROGRESS',
      409,
    );
  }
  if (status !== 'CALCULATED') {
    throw new TitleTransferPreviewError(
      'Confirme o plano CALCULATED antes de executar a transferência.',
      'NOT_CALCULATED',
      409,
    );
  }

  const fromContractId = row.from_contract_id ? String(row.from_contract_id) : null;
  let previousNumber: string | null = null;
  if (fromContractId) {
    const oldContract = await admin
      .from('contracts')
      .select('id, contract_number, generated_html, status')
      .eq('id', fromContractId)
      .maybeSingle();
    previousNumber = text(oldContract.data?.contract_number) || null;
  }
  const contractNumber = await getNextContractNumber(admin, companyId, companyId);
  assertContractNumberNotReused(previousNumber, contractNumber);
  if (!isValidStoredContractNumber(contractNumber)) {
    throw new TitleTransferPreviewError(
      'Não foi possível numerar o novo contrato.',
      'CONTRACT_NUMBER_INVALID',
      500,
    );
  }

  let built: Awaited<ReturnType<typeof buildTitleTransferReplacementContractHtml>>;
  try {
    built = await buildTitleTransferReplacementContractHtml(admin, {
      saleId,
      companyId,
      toCustomerId: String(row.to_customer_id),
      fromContractId,
      blockId: String(row.block_id),
      contractNumber,
      salePrice: input.salePrice,
      finance: input.finance,
      declaredAgioAmount: input.declaredAgioAmount,
      remainingInstallments: input.remainingInstallments,
      callerRole: callerRole || 'ADMIN',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[title-transfer execute] CONTRACT_HTML_FAILED', msg);
    throw new TitleTransferPreviewError(
      'Não foi possível gerar o novo contrato do cessionário.',
      'CONTRACT_HTML_FAILED',
      500,
    );
  }

  const payload: TitleTransferExecuteRpcPayload = {
    transfer_id: String(row.id),
    company_id: companyId,
    operator_user_id: text(input.userId),
    idempotency_key:
      text(input.idempotencyKey) ||
      text(row.idempotency_key) ||
      buildTitleTransferIdempotencyKey({
        saleId,
        fromCustomerId: String(row.from_customer_id),
        toCustomerId: String(row.to_customer_id),
        contractId: fromContractId,
      }),
    expected_from_customer_id: String(row.from_customer_id),
    expected_to_customer_id: String(row.to_customer_id),
    expected_contract_id: fromContractId,
    expected_block_id: String(row.block_id),
    cancel_receipt_ids: input.cancelReceiptIds,
    new_receipts: input.remainingInstallments.map((item) => ({
      installment_number: Number(item.installment_number) || 1,
      amount: money2(item.amount),
      due_date: item.due_date ? String(item.due_date).slice(0, 10) : null,
      financial_account_id: item.financial_account_id
        ? String(item.financial_account_id)
        : null,
    })),
    remaining_balance: money2(input.finance.remainingBalance),
    new_contract: {
      generated_html: built.html,
      contract_number: built.contractNumber,
      contract_model: built.contractModel,
      down_payment: 0,
      installments: input.remainingInstallments.length,
      ...built.snapshots,
    },
  };

  const rpc = await admin.rpc(TITLE_TRANSFER_EXECUTE_RPC, { p_payload: payload });
  if (rpc.error) {
    const parsed = parseTitleTransferExecuteRpcError(rpc.error.message || '');
    const code =
      parsed.code === 'CROSS_TENANT'
        ? TITLE_TRANSFER_CROSS_TENANT
        : parsed.code === 'TITULAR_CHANGED'
          ? TITLE_TRANSFER_TITULAR_CHANGED
          : parsed.code === 'ORIGIN_MISMATCH'
            ? TITLE_TRANSFER_ORIGIN_MISMATCH
            : parsed.code;
    throw new TitleTransferPreviewError(parsed.message, code, code === TITLE_TRANSFER_CROSS_TENANT ? 403 : 409);
  }
  const result = rpc.data as TitleTransferExecuteRpcResult;
  if (!result?.ok) {
    throw new TitleTransferPreviewError(
      'Falha ao executar a transferência.',
      'EXECUTE_FAILED',
      500,
    );
  }
  return {
    mutation: true,
    execute: true,
    persistTransfer: true,
    generateCharges: false,
    reused: Boolean(result.reused),
    status: 'EXECUTED',
    transferId: String(result.transfer_id || row.id),
    saleId: String(result.sale_id || saleId),
    blockId: String(result.block_id || row.block_id),
    fromCustomerId: String(result.from_customer_id || row.from_customer_id),
    toCustomerId: String(result.to_customer_id || row.to_customer_id),
    fromContractId: result.from_contract_id || fromContractId,
    toContractId: result.to_contract_id || null,
    toContractNumber: result.to_contract_number || built.contractNumber,
    previousTransferId: result.previous_transfer_id
      ? String(result.previous_transfer_id)
      : row.previous_transfer_id
        ? String(row.previous_transfer_id)
        : null,
    saleIdUnchanged: true,
    blockIdUnchanged: true,
    lotStillSold: true,
    receiptsPreserved: true,
  };
}

export { isTitleTransferCanceledReceipt, isTitleTransferPaidReceipt };
