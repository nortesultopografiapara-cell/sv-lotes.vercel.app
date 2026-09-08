/**
 * Resolve cobranças órfãs da Transferência de titularidade.
 * Só Inter. Não executa a RPC. Não cancela cobranças vigentes/pagas.
 * HTTP 202 sozinho não é sucesso — reusa cancelInterInstallmentCharge.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { cancelInterInstallmentCharge } from '@/lib/banking/inter/interSaleChargeService';
import { InterRemoteCancelError, sanitizeInterOperatorDetail, type InterPollOptions } from '@/lib/banking/inter/interCobrancaClient';
import type { InterOAuthFetchFn } from '@/lib/banking/inter/interOAuthClient';
import type { loadInterSecretsForServer } from '@/lib/banking/inter/interConfigRepository';
import {
  EXTERNAL_CHARGE_PROVIDER_INTER,
  type ExternalChargeRecord,
} from '@/lib/finance/externalCharges/types';
import {
  isDevelopHomologRuntime,
  isProductionSupabaseRuntime,
} from '@/lib/homolog/env';
import { TitleTransferPreviewError } from '@/lib/finance/saleTitleTransferPreviewService';
import { isTitleTransferExternalChargesLiveAuthorized } from '@/lib/finance/saleTitleTransferChargesLiveScope';

export const TITLE_TRANSFER_ORPHAN_RESOLVE_DISABLED =
  'TITLE_TRANSFER_ORPHAN_RESOLVE_DISABLED';
export const TITLE_TRANSFER_ORPHAN_NOT_INTER = 'TITLE_TRANSFER_ORPHAN_NOT_INTER';
export const TITLE_TRANSFER_ORPHAN_PAID = 'TITLE_TRANSFER_ORPHAN_PAID';
export const TITLE_TRANSFER_ORPHAN_RESOLVE_FAILED =
  'TITLE_TRANSFER_ORPHAN_RESOLVE_FAILED';

export type TitleTransferOrphanResolveItem = {
  chargeId: string;
  externalId: string | null;
  ok: boolean;
  reused: boolean;
  remoteConfirmed: boolean;
  status: string | null;
  error: string | null;
};

export type TitleTransferOrphanResolveResult = {
  ok: boolean;
  executeTransfer: false;
  persistReceipts: false;
  persistSale: false;
  resolvedChargeIds: string[];
  remainingOrphanIds: string[];
  items: TitleTransferOrphanResolveItem[];
};

export type TitleTransferOrphanCancelFn = (
  admin: SupabaseClient,
  input: {
    companyId: string;
    chargeId: string;
    fetchFn?: InterOAuthFetchFn;
    secretsLoader?: typeof loadInterSecretsForServer;
  },
) => Promise<{
  ok: true;
  reused: boolean;
  remoteConfirmed: boolean;
  chargeId: string;
  status: string;
}>;

function text(v: unknown): string {
  return String(v ?? '').trim();
}

function protectedChargeIdSet(input: {
  paid: ExternalChargeRecord[];
  open: ExternalChargeRecord[];
}): Set<string> {
  const ids = new Set<string>();
  for (const row of [...(input.paid || []), ...(input.open || [])]) {
    const id = text(row.chargeId);
    if (id) ids.add(id);
  }
  return ids;
}

export function assertTitleTransferOrphanResolveRuntime(url?: string): void {
  if (isProductionSupabaseRuntime(url)) {
    throw new TitleTransferPreviewError(
      'Resolver órfãs não está disponível em Production.',
      TITLE_TRANSFER_ORPHAN_RESOLVE_DISABLED,
      404,
    );
  }
  if (!isDevelopHomologRuntime(url)) {
    throw new TitleTransferPreviewError(
      'Resolver órfãs só está disponível no DEVELOP/Preview.',
      TITLE_TRANSFER_ORPHAN_RESOLVE_DISABLED,
      404,
    );
  }
}

/**
 * Cancela somente as órfãs já classificadas. Não toca em pagas/abertas vigentes.
 * Para no primeiro erro. Não chama a RPC da Transferência.
 */
export async function resolveTitleTransferClassifiedOrphanCharges(
  admin: SupabaseClient,
  input: {
    companyId: string;
    saleId: string;
    orphans: ExternalChargeRecord[];
    paid: ExternalChargeRecord[];
    open: ExternalChargeRecord[];
    fetchFn?: InterOAuthFetchFn;
    secretsLoader?: typeof loadInterSecretsForServer;
    poll?: InterPollOptions;
    cancelCharge?: TitleTransferOrphanCancelFn;
  },
): Promise<TitleTransferOrphanResolveResult> {
  const companyId = text(input.companyId);
  const saleId = text(input.saleId);
  if (!companyId || !saleId) {
    throw new TitleTransferPreviewError('saleId obrigatório.', 'SALE_ID_REQUIRED', 400);
  }
  assertTitleTransferOrphanResolveRuntime();

  const live = isTitleTransferExternalChargesLiveAuthorized({
    companyId,
    saleId,
    providers: [EXTERNAL_CHARGE_PROVIDER_INTER],
  });
  if (!live.live) {
    throw new TitleTransferPreviewError(
      'O cancelamento Inter de órfãs não está autorizado neste ambiente.',
      TITLE_TRANSFER_ORPHAN_RESOLVE_DISABLED,
      409,
    );
  }

  const protectedIds = protectedChargeIdSet(input);
  const items: TitleTransferOrphanResolveItem[] = [];
  const resolvedChargeIds: string[] = [];
  const cancelCharge: TitleTransferOrphanCancelFn =
    input.cancelCharge ||
    ((client, args) =>
      cancelInterInstallmentCharge(client, {
        companyId: args.companyId,
        chargeId: args.chargeId,
        fetchFn: input.fetchFn,
        secretsLoader: input.secretsLoader,
        poll: input.poll,
      }));

  for (const orphan of input.orphans || []) {
    const chargeId = text(orphan.chargeId);
    if (!chargeId) continue;
    if (protectedIds.has(chargeId)) {
      throw new TitleTransferPreviewError(
        'A resolução de órfãs recusou uma cobrança vigente ou paga.',
        TITLE_TRANSFER_ORPHAN_RESOLVE_FAILED,
        409,
      );
    }
    if (String(orphan.provider || '').toUpperCase() !== EXTERNAL_CHARGE_PROVIDER_INTER) {
      throw new TitleTransferPreviewError(
        'Há cobrança órfã que não é Inter. A resolução não a cancela automaticamente.',
        TITLE_TRANSFER_ORPHAN_NOT_INTER,
        409,
      );
    }
    if (orphan.classification === 'paid') {
      throw new TitleTransferPreviewError(
        'Há cobrança órfã já paga. Ela não será cancelada e a transferência permanece bloqueada.',
        TITLE_TRANSFER_ORPHAN_PAID,
        409,
      );
    }

    try {
      const result = await cancelCharge(admin, { companyId, chargeId });
      if (!result?.ok || result.remoteConfirmed === false) {
        throw new TitleTransferPreviewError(
          'Inter não confirmou o cancelamento remoto da órfã. O estado local não foi forçado.',
          TITLE_TRANSFER_ORPHAN_RESOLVE_FAILED,
          409,
        );
      }
      resolvedChargeIds.push(chargeId);
      items.push({
        chargeId,
        externalId: orphan.externalId || null,
        ok: true,
        reused: Boolean(result.reused),
        remoteConfirmed: true,
        status: result.status || 'CANCELLED',
        error: null,
      });
    } catch (err) {
      if (err instanceof TitleTransferPreviewError) throw err;
      const detail =
        err instanceof InterRemoteCancelError
          ? err.withParcelLabel(items.length + 1, (input.orphans || []).length)
          : sanitizeInterOperatorDetail(
              err instanceof Error ? err.message : String(err || ''),
            );
      throw new TitleTransferPreviewError(
        `${detail || 'Falha ao resolver cobrança órfã Inter.'} Nenhuma transferência foi executada.`,
        TITLE_TRANSFER_ORPHAN_RESOLVE_FAILED,
        409,
      );
    }
  }

  return {
    ok: true,
    executeTransfer: false,
    persistReceipts: false,
    persistSale: false,
    resolvedChargeIds,
    remainingOrphanIds: [],
    items,
  };
}

export async function resolveSaleTitleTransferOrphanCharges(
  admin: SupabaseClient,
  input: {
    saleId: string;
    userId: string;
    fetchFn?: InterOAuthFetchFn;
    secretsLoader?: typeof loadInterSecretsForServer;
    poll?: InterPollOptions;
    cancelCharge?: TitleTransferOrphanCancelFn;
  },
): Promise<TitleTransferOrphanResolveResult & { remainingOrphans: ExternalChargeRecord[] }> {
  const { loadSaleTitleTransferPreview } = await import(
    '@/lib/finance/saleTitleTransferPreviewService'
  );
  const preview = await loadSaleTitleTransferPreview(admin, {
    saleId: input.saleId,
    userId: input.userId,
  });
  const charges = preview.externalCharges;
  const resolved = await resolveTitleTransferClassifiedOrphanCharges(admin, {
    companyId: preview.current.companyId,
    saleId: preview.current.saleId,
    orphans: charges.orphans,
    paid: charges.paid,
    open: charges.open,
    fetchFn: input.fetchFn,
    secretsLoader: input.secretsLoader,
    poll: input.poll,
    cancelCharge: input.cancelCharge,
  });
  const after = await loadSaleTitleTransferPreview(admin, {
    saleId: input.saleId,
    userId: input.userId,
  });
  return {
    ...resolved,
    ok: after.externalCharges.orphans.length === 0,
    remainingOrphanIds: after.externalCharges.orphans.map((row) => row.chargeId),
    remainingOrphans: after.externalCharges.orphans,
  };
}
