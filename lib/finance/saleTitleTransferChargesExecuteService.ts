/**
 * P4 — cancela cobranças externas abertas do titular A, depois executa a RPC local.
 * Fala só com ExternalChargeProvider. Sem if ASAAS/INTER. Sem gerar boleto/Pix.
 * Sem ReleaseLot. Sem o LIVE da Troca de lote.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ensureExternalChargeProvidersRegistered,
  getExternalChargeProvider,
  listRegisteredExternalChargeProviders,
} from '@/lib/finance/externalCharges';
import { normalizeExternalChargeProviderCode } from '@/lib/finance/externalCharges/types';
import type { ExternalChargeRecord } from '@/lib/finance/externalCharges/types';
import { SALE_TITLE_TRANSFER_TABLE } from '@/lib/finance/saleTitleTransfer';
import {
  TITLE_TRANSFER_CHARGES_CANCEL_FAILED,
  TITLE_TRANSFER_CHARGES_LIVE_DISABLED,
  TITLE_TRANSFER_CHARGES_NON_CANCELABLE,
  TITLE_TRANSFER_CONFIRM_REQUIRED,
  TITLE_TRANSFER_INFLIGHT,
  TITLE_TRANSFER_TITULAR_CHANGED,
  assertExternalChargeCancelConfirmed,
  buildTitleTransferIdempotencyKey,
  titleTransferChargeNeedsCancel,
} from '@/lib/finance/saleTitleTransferExecute';
import {
  reduceTitleTransferExternalCharges,
  TITLE_TRANSFER_AMBIGUOUS_OPEN_CHARGES,
  TITLE_TRANSFER_AMBIGUOUS_OPEN_CHARGES_MESSAGE,
  TITLE_TRANSFER_ORPHAN_OPEN_CHARGES,
  TITLE_TRANSFER_ORPHAN_OPEN_CHARGES_MESSAGE,
} from '@/lib/finance/saleTitleTransferExternalCharges';
import {
  executeSaleTitleTransfer,
  type TitleTransferExecutedResult,
} from '@/lib/finance/saleTitleTransferExecuteService';
import {
  isTitleTransferExternalChargesLiveAuthorized,
  resolveTitleTransferExternalChargesLiveScope,
} from '@/lib/finance/saleTitleTransferChargesLiveScope';
import { prepareTitleTransferPlanPreview } from '@/lib/finance/saleTitleTransferPlanService';
import {
  isTitleTransferCanceledReceipt,
  isTitleTransferPaidReceipt,
  TITLE_TRANSFER_CROSS_TENANT,
  mapTitleTransferPreviewUserMessage,
} from '@/lib/finance/saleTitleTransferPreview';
import { InterRemoteCancelError, sanitizeInterOperatorDetail } from '@/lib/banking/inter/interCobrancaClient';
import { TitleTransferPreviewError } from '@/lib/finance/saleTitleTransferPreviewService';
import { loadLotSwapCallerProfile } from '@/lib/finance/saleLotSwapPreviewService';
import { assertTitleTransferCallerOwnsCompany } from '@/lib/finance/saleTitleTransferPreview';

export { TitleTransferPreviewError };

function formatTitleTransferBankCancelFailure(input: {
  providerLabel: string;
  index: number;
  total: number;
  cause: unknown;
}): string {
  const index = Math.max(1, input.index);
  const total = Math.max(index, input.total);
  if (input.cause instanceof InterRemoteCancelError) {
    return `${input.cause.withParcelLabel(index, total)} A transferência local não foi executada.`;
  }
  const detail =
    sanitizeInterOperatorDetail(
      input.cause instanceof Error ? input.cause.message : String(input.cause || ''),
    ) || 'Falha ao cancelar cobrança bancária do titular anterior.';
  return `${input.providerLabel} — Parcela ${index}/${total} — ${detail} A transferência local não foi executada.`;
}

type LocalExecuteFn = typeof executeSaleTitleTransfer;
let localExecuteImpl: LocalExecuteFn = executeSaleTitleTransfer;

export function setTitleTransferLocalExecuteForTests(fn: LocalExecuteFn | null): void {
  localExecuteImpl = fn || executeSaleTitleTransfer;
}

function text(v: unknown): string {
  return String(v ?? '').trim();
}

function nowIso(): string {
  return new Date().toISOString();
}

export type TitleTransferChargesExecuteResult = {
  mutation: true;
  execute: true;
  persistTransfer: true;
  generateCharges: false;
  live: boolean;
  remoteApiCalled: boolean;
  chargesPhase: string;
  transferId: string;
  saleId: string;
  local?: TitleTransferExecutedResult;
  canceledChargeIds: string[];
  preservedPaidChargeIds: string[];
};

async function persistChargesPhase(
  admin: SupabaseClient,
  input: {
    transferId: string;
    companyId: string;
    phase: string;
    snapshot: Record<string, unknown>;
    error?: string | null;
  },
): Promise<void> {
  const updated = await admin
    .from(SALE_TITLE_TRANSFER_TABLE)
    .update({
      charges_phase: input.phase,
      charges_snapshot: {
        ...input.snapshot,
        phase: input.phase,
        updatedAt: nowIso(),
      },
      charges_error: input.error || null,
      charges_phase_updated_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq('id', input.transferId)
    .eq('company_id', input.companyId);
  if (updated.error) {
    throw new Error(updated.error.message || 'Falha ao persistir charges_phase.');
  }
}

async function discoverUnknownBankProviders(
  admin: SupabaseClient,
  companyId: string,
  saleId: string,
): Promise<string[]> {
  const query = await admin
    .from('bank_charges')
    .select('provider')
    .eq('company_id', companyId)
    .eq('sale_id', saleId);
  if (query.error) return [];
  const known = new Set(
    listRegisteredExternalChargeProviders().map((provider) => provider.code),
  );
  const extra = new Set<string>();
  for (const row of (query.data || []) as Array<{ provider?: string | null }>) {
    const code = normalizeExternalChargeProviderCode(row.provider);
    if (code && !known.has(code)) extra.add(code);
  }
  return [...extra];
}

export async function executeSaleTitleTransferWithExternalCharges(
  admin: SupabaseClient,
  input: {
    saleId: string;
    userId: string;
    toCustomerId: string;
    transferDate?: string | null;
    declaredAgioAmount?: string | number | null;
    notes?: string | null;
    expectedContractId?: string | null;
    expectedFromCustomerId?: string | null;
    expectedBlockId?: string | null;
    confirmTransfer?: boolean;
    idempotencyKey?: string | null;
  },
): Promise<TitleTransferChargesExecuteResult> {
  ensureExternalChargeProvidersRegistered();
  if (input.confirmTransfer !== true) {
    throw new TitleTransferPreviewError(
      'Confirme a transferência antes de executar.',
      TITLE_TRANSFER_CONFIRM_REQUIRED,
      400,
    );
  }

  const saleId = text(input.saleId);
  const userId = text(input.userId);
  if (!saleId) {
    throw new TitleTransferPreviewError('saleId obrigatório.', 'SALE_ID_REQUIRED', 400);
  }
  const profile = await loadLotSwapCallerProfile(admin, userId);
  if (!profile) {
    throw new TitleTransferPreviewError(
      'Sessão ou autorização inválida.',
      'NO_PROFILE',
      403,
    );
  }
  const callerRole = text(profile.role);
  const callerTenant = text(
    profile.tenant_id || (profile as { company_id?: string }).company_id,
  );

  const plan = await prepareTitleTransferPlanPreview(admin, {
    saleId,
    userId,
    toCustomerId: input.toCustomerId,
    transferDate: input.transferDate,
    declaredAgioAmount: input.declaredAgioAmount,
    notes: input.notes,
    expectedContractId: input.expectedContractId,
    expectedFromCustomerId: input.expectedFromCustomerId,
    expectedBlockId: input.expectedBlockId,
  });

  const companyId = plan.preview.current.companyId;
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
  if (plan.confirmation.from.id !== plan.preview.current.titular.id) {
    throw new TitleTransferPreviewError(
      'O titular da venda mudou desde a prévia.',
      TITLE_TRANSFER_TITULAR_CHANGED,
      409,
    );
  }

  const fromCustomerId = plan.confirmation.from.id;
  const toCustomerId = plan.confirmation.to.id;
  const expectedContractId = plan.preview.current.contract.id;
  const idempotencyKey =
    text(input.idempotencyKey) ||
    buildTitleTransferIdempotencyKey({
      saleId,
      fromCustomerId,
      toCustomerId,
      contractId: expectedContractId,
    });

  const executedSame = await admin
    .from(SALE_TITLE_TRANSFER_TABLE)
    .select('*')
    .eq('company_id', companyId)
    .eq('idempotency_key', idempotencyKey)
    .eq('status', 'EXECUTED')
    .maybeSingle();
  if (!executedSame.error && executedSame.data) {
    const row = executedSame.data as Record<string, unknown>;
    const snap = (row.charges_snapshot || {}) as Record<string, unknown>;
    const reusedCanceled = Array.isArray(snap.canceledChargeIds)
      ? (snap.canceledChargeIds as unknown[]).map((id) => String(id))
      : [];
    return {
      mutation: true,
      execute: true,
      persistTransfer: true,
      generateCharges: false,
      live: false,
      remoteApiCalled: false,
      chargesPhase: text(row.charges_phase) || 'COMPLETED',
      transferId: String(row.id),
      saleId,
      local: {
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
        previousTransferId: row.previous_transfer_id
          ? String(row.previous_transfer_id)
          : null,
        saleIdUnchanged: true,
        blockIdUnchanged: true,
        lotStillSold: true,
        receiptsPreserved: true,
      },
      canceledChargeIds: reusedCanceled,
      preservedPaidChargeIds: plan.preview.externalCharges.paid.map((row) => row.chargeId),
    };
  }

  const inflight = await admin
    .from(SALE_TITLE_TRANSFER_TABLE)
    .select('*')
    .eq('sale_id', saleId)
    .in('status', ['CALCULATED', 'EXECUTING'])
    .maybeSingle();
  let transferId = '';
  if (!inflight.error && inflight.data) {
    const row = inflight.data as Record<string, unknown>;
    if (
      String(row.to_customer_id) !== toCustomerId ||
      String(row.from_customer_id) !== fromCustomerId
    ) {
      throw new TitleTransferPreviewError(
        'Já existe uma transferência em preparação para esta venda.',
        TITLE_TRANSFER_INFLIGHT,
        409,
      );
    }
    transferId = String(row.id);
  } else {
    const inserted = await admin
      .from(SALE_TITLE_TRANSFER_TABLE)
      .insert({
        company_id: companyId,
        tenant_id: companyId,
        sale_id: saleId,
        block_id: plan.confirmation.blockId,
        project_id: plan.preview.current.property.projectId,
        from_customer_id: fromCustomerId,
        to_customer_id: toCustomerId,
        previous_transfer_id: plan.futureExecution.previousTransferId,
        from_contract_id: expectedContractId,
        declared_agio_amount: plan.confirmation.declaredAgioAmount,
        transfer_date: plan.confirmation.transferDate,
        notes: plan.confirmation.notes,
        schedule_mode: 'ASSUME_CURRENT',
        sale_price: plan.confirmation.salePrice,
        total_paid: plan.confirmation.finance.totalPaid,
        remaining_balance: plan.confirmation.finance.remainingBalance,
        financial_snapshot: {
          finance: plan.confirmation.finance,
          declaredAgioAmount: plan.confirmation.declaredAgioAmount,
        },
        charges_phase: 'PREPARED',
        charges_snapshot: {},
        status: 'CALCULATED',
        operator_user_id: userId,
        idempotency_key: idempotencyKey,
      })
      .select('id')
      .maybeSingle();
    if (inserted.error || !inserted.data) {
      throw new TitleTransferPreviewError(
        inserted.error?.message || 'Não foi possível preparar a transferência.',
        'PLAN_PERSIST_FAILED',
        500,
      );
    }
    transferId = String((inserted.data as { id: string }).id);
  }

  const receiptRes = await admin
    .from('finance_receipts')
    .select(
      'id, status, amount, paid_at, due_date, installment_number, sale_id, financial_account_id, project_id',
    )
    .eq('sale_id', saleId);
  const receipts = ((receiptRes.data || []) as Array<Record<string, unknown>>).filter(
    (row) => String(row.sale_id || '') === saleId,
  );
  const remainingRows = receipts.filter(
    (row) =>
      !isTitleTransferPaidReceipt(row) && !isTitleTransferCanceledReceipt(row),
  );
  const remainingInstallments = remainingRows.map((row) => ({
    installment_number: Number(row.installment_number) || 0,
    amount: Number(row.amount) || 0,
    due_date: row.due_date ? String(row.due_date) : null,
    financial_account_id: row.financial_account_id
      ? String(row.financial_account_id)
      : null,
  }));
  const cancelReceiptIds = remainingRows.map((row) => String(row.id));
  const receiptIds = receipts.map((row) => String(row.id));

  const listed: ExternalChargeRecord[] = [...plan.preview.externalCharges.paid, ...plan.preview.externalCharges.open, ...plan.preview.externalCharges.nonCancelable];
  const unknown = await discoverUnknownBankProviders(admin, companyId, saleId);
  for (const code of unknown) {
    const extra = getExternalChargeProvider(code);
    const rows = await extra.listChargesForReceipts(admin, {
      companyId,
      saleId,
      receiptIds,
    });
    listed.push(...rows);
  }
  for (const provider of listRegisteredExternalChargeProviders()) {
    if (listed.some((row) => row.provider === provider.code)) continue;
    const rows = await provider.listChargesForReceipts(admin, {
      companyId,
      saleId,
      receiptIds,
    });
    listed.push(...rows);
  }

  const unique = new Map<string, ExternalChargeRecord>();
  for (const row of listed) unique.set(`${row.provider}:${row.chargeId}`, row);
  const reduced = reduceTitleTransferExternalCharges({
    receipts,
    charges: [...unique.values()],
  });
  const paid = reduced.paid;
  const wouldCancel = [...reduced.open, ...reduced.cancelledReusable].filter((row) =>
    titleTransferChargeNeedsCancel(row),
  );
  const nonCancelable = reduced.nonCancelable;

  const liveDecision = isTitleTransferExternalChargesLiveAuthorized({
    companyId,
    saleId,
    providers: wouldCancel.map((row) => row.provider),
  });
  const liveScope = resolveTitleTransferExternalChargesLiveScope({
    companyId,
    saleId,
    provider: wouldCancel[0]?.provider || null,
  });
  const live = liveDecision.live;
  void liveScope;

  const existingSnap = inflight.data
    ? ((inflight.data as Record<string, unknown>).charges_snapshot as Record<string, unknown> | null)
    : null;
  const canceledChargeIds: string[] = Array.isArray(existingSnap?.canceledChargeIds)
    ? [...(existingSnap?.canceledChargeIds as string[])]
    : [];
  let remoteApiCalled = false;

  if (reduced.blockCode) {
    await persistChargesPhase(admin, {
      transferId,
      companyId,
      phase: 'FAILED',
      snapshot: {
        failedStage: 'BLOCK',
        canceledChargeIds,
        orphanChargeIds: reduced.orphans.map((row) => row.chargeId),
        ambiguousReceiptIds: reduced.ambiguousReceiptIds,
      },
      error: reduced.blockCode,
    });
    throw new TitleTransferPreviewError(
      reduced.blockMessage ||
        (reduced.blockCode === TITLE_TRANSFER_AMBIGUOUS_OPEN_CHARGES
          ? TITLE_TRANSFER_AMBIGUOUS_OPEN_CHARGES_MESSAGE
          : TITLE_TRANSFER_ORPHAN_OPEN_CHARGES_MESSAGE),
      reduced.blockCode === TITLE_TRANSFER_AMBIGUOUS_OPEN_CHARGES
        ? TITLE_TRANSFER_AMBIGUOUS_OPEN_CHARGES
        : TITLE_TRANSFER_ORPHAN_OPEN_CHARGES,
      409,
    );
  }

  if (nonCancelable.length > 0) {
    await persistChargesPhase(admin, {
      transferId,
      companyId,
      phase: 'FAILED',
      snapshot: { failedStage: 'BLOCK', canceledChargeIds },
      error: TITLE_TRANSFER_CHARGES_NON_CANCELABLE,
    });
    throw new TitleTransferPreviewError(
      'Há cobrança bancária incompatível (C6/Bradesco/Nubank ou não cancelável). A transferência local não foi executada.',
      TITLE_TRANSFER_CHARGES_NON_CANCELABLE,
      409,
    );
  }

  if (wouldCancel.length > 0 && !live) {
    await persistChargesPhase(admin, {
      transferId,
      companyId,
      phase: 'PREPARED',
      snapshot: { canceledChargeIds },
      error: TITLE_TRANSFER_CHARGES_LIVE_DISABLED,
    });
    throw new TitleTransferPreviewError(
      'O cancelamento bancário desta transferência não está autorizado neste ambiente. Nenhuma venda, lote, parcela ou contrato foi alterado.',
      TITLE_TRANSFER_CHARGES_LIVE_DISABLED,
      409,
    );
  }

  if (wouldCancel.length > 0) {
    await persistChargesPhase(admin, {
      transferId,
      companyId,
      phase: 'CANCELLING',
      snapshot: { canceledChargeIds, phase: 'CANCELLING' },
    });
    for (let i = 0; i < wouldCancel.length; i += 1) {
      const charge = wouldCancel[i];
      if (charge.classification === 'paid') continue;
      if (canceledChargeIds.includes(charge.chargeId)) continue;
      const provider = getExternalChargeProvider(charge.provider);
      try {
        remoteApiCalled = true;
        const result = await provider.cancelCancelableCharge(admin, {
          companyId,
          chargeId: charge.chargeId,
        });
        assertExternalChargeCancelConfirmed(result);
        canceledChargeIds.push(charge.chargeId);
      } catch (err) {
        const message = formatTitleTransferBankCancelFailure({
          providerLabel: provider.displayName || charge.provider,
          index: i + 1,
          total: wouldCancel.length,
          cause: err,
        });
        await persistChargesPhase(admin, {
          transferId,
          companyId,
          phase: 'FAILED',
          snapshot: { failedStage: 'CANCEL', canceledChargeIds, error: message },
          error: TITLE_TRANSFER_CHARGES_CANCEL_FAILED,
        });
        throw new TitleTransferPreviewError(
          message,
          TITLE_TRANSFER_CHARGES_CANCEL_FAILED,
          409,
        );
      }
    }
    await persistChargesPhase(admin, {
      transferId,
      companyId,
      phase: 'CANCELED',
      snapshot: { canceledChargeIds, phase: 'CANCELED' },
    });
  } else {
    await persistChargesPhase(admin, {
      transferId,
      companyId,
      phase: 'PREPARED',
      snapshot: { canceledChargeIds },
    });
  }

  const local = await localExecuteImpl(admin, {
    saleId,
    userId,
    transferId,
    idempotencyKey,
    finance: plan.confirmation.finance,
    salePrice: plan.confirmation.salePrice,
    declaredAgioAmount: plan.confirmation.declaredAgioAmount,
    remainingInstallments,
    cancelReceiptIds,
  });

  await persistChargesPhase(admin, {
    transferId,
    companyId,
    phase: 'COMPLETED',
    snapshot: {
      canceledChargeIds,
      localExecuted: true,
      phase: 'COMPLETED',
    },
  });

  return {
    mutation: true,
    execute: true,
    persistTransfer: true,
    generateCharges: false,
    live,
    remoteApiCalled,
    chargesPhase: 'COMPLETED',
    transferId,
    saleId,
    local,
    canceledChargeIds,
    preservedPaidChargeIds: paid.map((row) => row.chargeId),
  };
}
