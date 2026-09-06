/**
 * Fase 5B — orquestra cobranças externas da Troca de lote.
 * Fala só com ExternalChargeProvider (registry). Sem if/switch de banco.
 * Não altera a RPC da Fase 4. Não finge atomicidade com APIs externas.
 *
 * Ordem:
 *   PREPARED → CANCELLING → CANCELED → executeSaleLotSwap → LOCAL_EXECUTED
 *   → GENERATING → COMPLETED
 * Falha no cancelamento: FAILED e NÃO executa a Fase 4.
 * Falha na geração: troca local permanece EXECUTED; charges_phase FAILED + localExecuted.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ensureExternalChargeProvidersRegistered,
  getExternalChargeProvider,
} from '@/lib/finance/externalCharges';
import { SALE_LOT_SWAP_TABLE } from '@/lib/finance/saleLotSwap';
import {
  isLotSwapChargesPhase,
  isLotSwapExternalChargeLiveEnabled,
  LOT_SWAP_CHARGES_CANCEL_FAILED,
  LOT_SWAP_CHARGES_GENERATE_FAILED,
  LOT_SWAP_CHARGES_LIVE_DISABLED,
  type LotSwapChargesPhase,
  type LotSwapChargesSnapshot,
} from '@/lib/finance/saleLotSwapChargesPhase';
import {
  executeSaleLotSwap,
  LotSwapPreviewError,
  type LotSwapExecutedResult,
} from '@/lib/finance/saleLotSwapExecuteService';
import {
  loadLotSwapExternalChargePreview,
  LOT_SWAP_EXTERNAL_CHARGES_NON_CANCELABLE,
} from '@/lib/finance/saleLotSwapExternalCharges';
import {
  assertLotSwapCallerOwnsCompany,
  isLotSwapFutureReceipt,
  isLotSwapPaidReceipt,
  LOT_SWAP_CROSS_TENANT,
} from '@/lib/finance/saleLotSwapPreview';
import { loadLotSwapCallerProfile } from '@/lib/finance/saleLotSwapPreviewService';
import type { LotSwapFinancialPlan } from '@/lib/finance/saleLotSwapPlan';

export { LotSwapPreviewError };

export class LotSwapChargesPhaseError extends LotSwapPreviewError {
  chargesPhase: LotSwapChargesPhase;
  local?: LotSwapExecutedResult;
  remoteApiCalled: boolean;

  constructor(
    message: string,
    code: string,
    status: number,
    extra: {
      chargesPhase: LotSwapChargesPhase;
      local?: LotSwapExecutedResult;
      remoteApiCalled?: boolean;
    },
  ) {
    super(message, code, status);
    this.name = 'LotSwapChargesPhaseError';
    this.chargesPhase = extra.chargesPhase;
    this.local = extra.local;
    this.remoteApiCalled = Boolean(extra.remoteApiCalled);
  }
}

function text(v: unknown): string {
  return String(v ?? '').trim();
}

function nowIso(): string {
  return new Date().toISOString();
}

function planFromSwap(swap: Record<string, unknown>): LotSwapFinancialPlan | null {
  const snap =
    swap.financial_snapshot && typeof swap.financial_snapshot === 'object'
      ? (swap.financial_snapshot as Record<string, unknown>)
      : null;
  const plan = snap?.plan;
  return plan && typeof plan === 'object' ? (plan as LotSwapFinancialPlan) : null;
}

function phaseOf(swap: Record<string, unknown>): LotSwapChargesPhase | null {
  const raw = text(swap.charges_phase);
  return isLotSwapChargesPhase(raw) ? raw : null;
}

function isLocalAlreadyExecuted(swap: Record<string, unknown>): boolean {
  if (text(swap.status) === 'EXECUTED') return true;
  const phase = phaseOf(swap);
  return phase === 'LOCAL_EXECUTED' || phase === 'GENERATING' || phase === 'COMPLETED';
}

function isCancelAlreadyDone(swap: Record<string, unknown>): boolean {
  if (isLocalAlreadyExecuted(swap)) return true;
  const phase = phaseOf(swap);
  if (phase === 'CANCELED') return true;
  if (phase === 'FAILED') {
    const snap =
      swap.charges_snapshot && typeof swap.charges_snapshot === 'object'
        ? (swap.charges_snapshot as LotSwapChargesSnapshot)
        : null;
    return Boolean(snap?.localExecuted);
  }
  return false;
}

async function persistChargesPhase(
  admin: SupabaseClient,
  input: {
    swapId: string;
    companyId: string;
    phase: LotSwapChargesPhase;
    snapshot: LotSwapChargesSnapshot;
    error?: string | null;
  },
): Promise<void> {
  const updated = await admin
    .from(SALE_LOT_SWAP_TABLE)
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
    .eq('id', input.swapId)
    .eq('company_id', input.companyId);
  if (updated.error) {
    const message = updated.error.message || 'Falha ao persistir charges_phase.';
    if (/charges_phase|schema cache|does not exist/i.test(message)) {
      console.warn(
        '[lot-swap 5B] persistência charges_phase indisponível (aplique a migration só no DEVELOP):',
        message,
      );
      return;
    }
    throw new Error(message);
  }
}

export type LotSwapChargesExecuteResult = {
  mutation: true;
  execute: boolean;
  persistCharges: true;
  live: boolean;
  remoteApiCalled: boolean;
  chargesPhase: LotSwapChargesPhase;
  swapId: string;
  saleId: string;
  local?: LotSwapExecutedResult;
  canceledChargeIds: string[];
  generatedReceiptIds: string[];
  reusedReceiptIds: string[];
};

type LocalExecuteFn = typeof executeSaleLotSwap;
let localExecuteImpl: LocalExecuteFn = executeSaleLotSwap;

export function setSaleLotSwapLocalExecuteForTests(fn: LocalExecuteFn | null): void {
  localExecuteImpl = fn || executeSaleLotSwap;
}

export type LotSwapChargesExecuteInput = {
  saleId: string;
  userId: string;
  swapId?: string | null;
  idempotencyKey?: string | null;
  callerRole?: string | null;
  live?: boolean;
};

export async function executeSaleLotSwapWithExternalCharges(
  admin: SupabaseClient,
  input: LotSwapChargesExecuteInput,
): Promise<LotSwapChargesExecuteResult> {
  ensureExternalChargeProvidersRegistered();
  const saleId = text(input.saleId);
  const userId = text(input.userId);
  if (!saleId) {
    throw new LotSwapPreviewError('saleId obrigatório.', 'SALE_ID_REQUIRED', 400);
  }
  if (!userId) {
    throw new LotSwapPreviewError(
      'Sessão ou autorização inválida.',
      'UNAUTHORIZED',
      401,
    );
  }
  const live = isLotSwapExternalChargeLiveEnabled(input.live);

  const profile = await loadLotSwapCallerProfile(admin, userId);
  if (!profile) {
    throw new LotSwapPreviewError(
      'Sessão ou autorização inválida.',
      'NO_PROFILE',
      403,
    );
  }
  const callerTenant = text(
    profile.tenant_id || (profile as { company_id?: string }).company_id,
  );
  const callerRole = text(profile.role || input.callerRole);

  let loaded = text(input.swapId)
    ? await admin
        .from(SALE_LOT_SWAP_TABLE)
        .select('*')
        .eq('id', text(input.swapId))
        .eq('sale_id', saleId)
        .maybeSingle()
    : await admin
        .from(SALE_LOT_SWAP_TABLE)
        .select('*')
        .eq('sale_id', saleId)
        .in('status', ['CALCULATED', 'EXECUTING'])
        .maybeSingle();
  if (!text(input.swapId) && !loaded.error && !loaded.data) {
    loaded = await admin
      .from(SALE_LOT_SWAP_TABLE)
      .select('*')
      .eq('sale_id', saleId)
      .eq('status', 'EXECUTED')
      .order('executed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
  }
  if (loaded.error) {
    throw new LotSwapPreviewError(
      'Não foi possível carregar o plano da troca.',
      'PLAN_LOAD_FAILED',
      500,
    );
  }
  const swap = loaded.data as Record<string, unknown> | null;
  if (!swap?.id) {
    throw new LotSwapPreviewError(
      'Confirme o plano CALCULATED antes de executar a troca.',
      'PLAN_NOT_CALCULATED',
      409,
    );
  }
  const swapId = String(swap.id);
  const companyId = text(swap.company_id || swap.tenant_id);
  if (!companyId) {
    throw new LotSwapPreviewError(
      'A troca não pertence à empresa atual.',
      'TENANT_MISMATCH',
      403,
    );
  }
  const tenantGuard = assertLotSwapCallerOwnsCompany({
    callerTenantId: callerTenant,
    resourceCompanyId: companyId,
    callerRole,
  });
  if (!tenantGuard.ok) {
    throw new LotSwapPreviewError(
      'A venda não pertence à empresa atual.',
      LOT_SWAP_CROSS_TENANT,
      403,
    );
  }

  const plan = planFromSwap(swap);
  const preview = await loadLotSwapExternalChargePreview(admin, {
    companyId,
    saleId,
    plan,
  });

  const snapshot: LotSwapChargesSnapshot = {
    phase: 'PREPARED',
    live,
    failedStage: null,
    localExecuted: isLocalAlreadyExecuted(swap),
    canceledChargeIds: Array.isArray((swap.charges_snapshot as LotSwapChargesSnapshot | null)?.canceledChargeIds)
      ? [...((swap.charges_snapshot as LotSwapChargesSnapshot).canceledChargeIds || [])]
      : [],
    generatedReceiptIds: [],
    reusedReceiptIds: [],
    error: null,
  };

  const canceledChargeIds = [...(snapshot.canceledChargeIds || [])];
  let local: LotSwapExecutedResult | undefined;
  let remoteApiCalled = false;
  const localAlready = isLocalAlreadyExecuted(swap);

  if (preview.wouldBlock && !localAlready) {
    snapshot.failedStage = 'BLOCK';
    snapshot.error = preview.blockMessage;
    await persistChargesPhase(admin, {
      swapId,
      companyId,
      phase: 'FAILED',
      snapshot: { ...snapshot, phase: 'FAILED' },
      error: preview.blockMessage,
    });
    throw new LotSwapChargesPhaseError(
      preview.blockMessage || 'Cobrança externa incompatível.',
      preview.blockCode || LOT_SWAP_EXTERNAL_CHARGES_NON_CANCELABLE,
      409,
      { chargesPhase: 'FAILED', remoteApiCalled: false },
    );
  }

  if (!localAlready) {
    await persistChargesPhase(admin, {
      swapId,
      companyId,
      phase: 'PREPARED',
      snapshot,
    });

    if (!isCancelAlreadyDone(swap)) {
      if (preview.wouldCancel.length > 0 && !live) {
        await persistChargesPhase(admin, {
          swapId,
          companyId,
          phase: 'PREPARED',
          snapshot: {
            ...snapshot,
            error: 'Cancelamento remoto desligado nesta entrega. Sem chamada bancária.',
          },
          error: LOT_SWAP_CHARGES_LIVE_DISABLED,
        });
        throw new LotSwapChargesPhaseError(
          'Há cobranças externas a cancelar. A homologação bancária real ainda não está autorizada.',
          LOT_SWAP_CHARGES_LIVE_DISABLED,
          409,
          { chargesPhase: 'PREPARED', remoteApiCalled: false },
        );
      }

      if (preview.wouldCancel.length > 0) {
        await persistChargesPhase(admin, {
          swapId,
          companyId,
          phase: 'CANCELLING',
          snapshot: { ...snapshot, phase: 'CANCELLING' },
        });
        for (const charge of preview.wouldCancel) {
          if (charge.classification === 'paid') continue;
          const provider = getExternalChargeProvider(charge.provider);
          try {
            remoteApiCalled = true;
            const result = await provider.cancelCancelableCharge(admin, {
              companyId,
              chargeId: charge.chargeId,
            });
            canceledChargeIds.push(result.chargeId);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            snapshot.failedStage = 'CANCEL';
            snapshot.error = message;
            await persistChargesPhase(admin, {
              swapId,
              companyId,
              phase: 'FAILED',
              snapshot: { ...snapshot, phase: 'FAILED', canceledChargeIds },
              error: message,
            });
            throw new LotSwapChargesPhaseError(
              'Falha ao cancelar cobrança externa. A troca local não foi executada.',
              LOT_SWAP_CHARGES_CANCEL_FAILED,
              409,
              { chargesPhase: 'FAILED', remoteApiCalled },
            );
          }
        }
      }
    }

    snapshot.canceledChargeIds = canceledChargeIds;
    await persistChargesPhase(admin, {
      swapId,
      companyId,
      phase: 'CANCELED',
      snapshot: { ...snapshot, phase: 'CANCELED', canceledChargeIds },
    });

    local = await localExecuteImpl(admin, {
      saleId,
      userId,
      swapId,
      idempotencyKey: input.idempotencyKey,
      callerRole: callerRole || input.callerRole,
    });
  } else {
    local = await localExecuteImpl(admin, {
      saleId,
      userId,
      swapId,
      idempotencyKey: input.idempotencyKey,
      callerRole: callerRole || input.callerRole,
    });
  }

  snapshot.localExecuted = true;
  snapshot.canceledChargeIds = canceledChargeIds;
  await persistChargesPhase(admin, {
    swapId,
    companyId,
    phase: 'LOCAL_EXECUTED',
    snapshot: { ...snapshot, phase: 'LOCAL_EXECUTED', localExecuted: true },
  });

  const receiptsQuery = await admin
    .from('finance_receipts')
    .select('id, status, paid_at, installment_number')
    .eq('sale_id', saleId);
  const receiptRows = (receiptsQuery.data || []) as Array<{
    id?: string;
    status?: string | null;
    paid_at?: string | null;
  }>;
  const newReceiptIds = receiptRows
    .filter((row) => isLotSwapFutureReceipt(row) && !isLotSwapPaidReceipt(row))
    .map((row) => String(row.id || ''))
    .filter(Boolean);

  const generatedReceiptIds: string[] = [];
  const reusedReceiptIds: string[] = [];

  const done = (phase: LotSwapChargesPhase, extra?: Partial<LotSwapChargesExecuteResult>) =>
    ({
      mutation: true as const,
      execute: true,
      persistCharges: true as const,
      live,
      remoteApiCalled,
      chargesPhase: phase,
      swapId,
      saleId,
      local,
      canceledChargeIds,
      generatedReceiptIds,
      reusedReceiptIds,
      ...extra,
    }) satisfies LotSwapChargesExecuteResult;

  if (newReceiptIds.length === 0 || !preview.supportsGeneration) {
    await persistChargesPhase(admin, {
      swapId,
      companyId,
      phase: 'COMPLETED',
      snapshot: {
        ...snapshot,
        phase: 'COMPLETED',
        localExecuted: true,
        canceledChargeIds,
        error: null,
      },
    });
    return done('COMPLETED');
  }

  if (!live) {
    await persistChargesPhase(admin, {
      swapId,
      companyId,
      phase: 'LOCAL_EXECUTED',
      snapshot: {
        ...snapshot,
        phase: 'LOCAL_EXECUTED',
        localExecuted: true,
        error: 'Geração remota desligada nesta entrega. Retry seguro depois da autorização.',
      },
      error: LOT_SWAP_CHARGES_LIVE_DISABLED,
    });
    return done('LOCAL_EXECUTED');
  }

  await persistChargesPhase(admin, {
    swapId,
    companyId,
    phase: 'GENERATING',
    snapshot: { ...snapshot, phase: 'GENERATING', localExecuted: true },
  });

  const generator = getExternalChargeProvider(preview.activeProvider);
  try {
    remoteApiCalled = true;
    const generated = await generator.generateMissingCharges(admin, {
      companyId,
      saleId,
      receiptIds: newReceiptIds,
    });
    for (const receiptId of newReceiptIds) {
      if (generated.reused > reusedReceiptIds.length && reusedReceiptIds.length < generated.reused) {
        reusedReceiptIds.push(receiptId);
      } else if (generated.created > generatedReceiptIds.length) {
        generatedReceiptIds.push(receiptId);
      }
    }
    if (!generated.ok || generated.errors.length) {
      const message = generated.errors[0]?.message || 'Falha ao gerar cobrança da nova parcela.';
      snapshot.failedStage = 'GENERATE';
      snapshot.error = message;
      await persistChargesPhase(admin, {
        swapId,
        companyId,
        phase: 'FAILED',
        snapshot: {
          ...snapshot,
          phase: 'FAILED',
          localExecuted: true,
          generatedReceiptIds,
          reusedReceiptIds,
        },
        error: message,
      });
      throw new LotSwapChargesPhaseError(
        'A troca local foi concluída, mas a geração da cobrança externa falhou. Retry não duplica boleto/Pix.',
        LOT_SWAP_CHARGES_GENERATE_FAILED,
        409,
        { chargesPhase: 'FAILED', local, remoteApiCalled: true },
      );
    }
  } catch (err) {
    if (err instanceof LotSwapChargesPhaseError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    snapshot.failedStage = 'GENERATE';
    snapshot.error = message;
    await persistChargesPhase(admin, {
      swapId,
      companyId,
      phase: 'FAILED',
      snapshot: { ...snapshot, phase: 'FAILED', localExecuted: true },
      error: message,
    });
    throw new LotSwapChargesPhaseError(
      'A troca local foi concluída, mas a geração da cobrança externa falhou. Retry não duplica boleto/Pix.',
      LOT_SWAP_CHARGES_GENERATE_FAILED,
      409,
      { chargesPhase: 'FAILED', local, remoteApiCalled: true },
    );
  }

  await persistChargesPhase(admin, {
    swapId,
    companyId,
    phase: 'COMPLETED',
    snapshot: {
      ...snapshot,
      phase: 'COMPLETED',
      localExecuted: true,
      canceledChargeIds,
      generatedReceiptIds,
      reusedReceiptIds,
      error: null,
    },
  });

  return done('COMPLETED');
}
