/**
 * Cancelamento de cobranças Inter (bank_charges) no fluxo Liberar lote.
 * Espelha a disciplina do Asaas (sync remoto → cancel → falha crítica),
 * mas usa POST /cobrancas/{codigo}/cancelar — não o DELETE Asaas.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  cancelInterCobranca,
  fetchInterCobrancaByCodigo,
} from '@/lib/banking/inter/interCobrancaClient';
import { loadInterSecretsForServer } from '@/lib/banking/inter/interConfigRepository';
import type { InterOAuthFetchFn } from '@/lib/banking/inter/interOAuthClient';
import {
  classifyRemoteInterSituacaoForRelease,
  interCancelMotivoFromReleaseMotive,
  isAlreadyCancelledInterBankChargeStatus,
  isLocalInterCancelCandidateStatus,
  isPaidInterBankChargeStatus,
  normalizeInterBankChargeStatus,
  normalizeInterSituacaoForRelease,
  type ReleaseInterDisposition,
} from '@/lib/finance/releaseLotShared';

export type InterReleaseProcessResult = {
  cancelableIds: string[];
  cancelled: number;
  preservedPaid: number;
  alreadyCancelled: number;
  failed: Array<{
    chargeId: string;
    error: string;
    localStatus?: string | null;
    remoteStatus?: string | null;
    disposition?: ReleaseInterDisposition;
    externalId?: string | null;
  }>;
};

async function markLocalInterCancelled(
  admin: SupabaseClient,
  companyId: string,
  chargeId: string,
  situacao?: string | null,
): Promise<void> {
  const { data: prev } = await admin
    .from('bank_charges')
    .select('metadata')
    .eq('id', chargeId)
    .eq('company_id', companyId)
    .maybeSingle();
  const prevMeta =
    prev?.metadata && typeof prev.metadata === 'object' && !Array.isArray(prev.metadata)
      ? (prev.metadata as Record<string, unknown>)
      : {};
  await admin
    .from('bank_charges')
    .update({
      status: 'CANCELLED',
      metadata: {
        ...prevMeta,
        interSituacao: situacao || prevMeta.interSituacao || 'CANCELADO',
        releaseLotCancelledAt: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', chargeId)
    .eq('company_id', companyId);
}

/**
 * Consulta situacao real no Inter antes de decidir.
 * - A_RECEBER / ATRASADO / EM_PROCESSAMENTO → cancelável
 * - RECEBIDO / PAGO → preservar
 * - CANCELADO / EXPIRADO → já encerrada
 * - falha de API → failed (bloqueia liberação local)
 */
export async function resolveInterChargesForRelease(
  admin: SupabaseClient,
  companyId: string,
  candidateIds: string[],
  options?: {
    executeCancel?: boolean;
    motiveCode?: string | null;
    fetchFn?: InterOAuthFetchFn;
    /** Somente testes — evita rede/DB de credenciais. */
    secretsLoader?: typeof loadInterSecretsForServer;
  },
): Promise<InterReleaseProcessResult> {
  const executeCancel = options?.executeCancel === true;
  const motivo = interCancelMotivoFromReleaseMotive(options?.motiveCode);
  const secretsLoader = options?.secretsLoader || loadInterSecretsForServer;
  const cancelableIds: string[] = [];
  const failed: InterReleaseProcessResult['failed'] = [];
  let cancelled = 0;
  let preservedPaid = 0;
  let alreadyCancelled = 0;

  for (const chargeId of candidateIds) {
    const { data: localRow } = await admin
      .from('bank_charges')
      .select(
        'id, status, external_id, integration_id, financial_account_id, provider, metadata',
      )
      .eq('id', chargeId)
      .eq('company_id', companyId)
      .eq('provider', 'INTER')
      .maybeSingle();

    if (!localRow) {
      alreadyCancelled += 1;
      continue;
    }

    const localBefore = normalizeInterBankChargeStatus(
      (localRow as { status?: string }).status,
    );
    const externalId = String(
      (localRow as { external_id?: string }).external_id || '',
    ).trim();

    if (isPaidInterBankChargeStatus(localBefore)) {
      preservedPaid += 1;
      console.log('[releaseLot][inter] preserve_paid_local', {
        chargeId: chargeId.slice(0, 8),
        localBefore,
        externalId,
      });
      continue;
    }
    if (isAlreadyCancelledInterBankChargeStatus(localBefore)) {
      alreadyCancelled += 1;
      continue;
    }
    if (!isLocalInterCancelCandidateStatus(localBefore)) {
      failed.push({
        chargeId,
        error: `Cobrança Inter com status local "${localBefore}" não é candidata a cancelamento.`,
        localStatus: localBefore,
        remoteStatus: null,
        disposition: 'block_non_removable',
        externalId,
      });
      continue;
    }
    if (!externalId) {
      failed.push({
        chargeId,
        error:
          'Cobrança Inter sem codigoSolicitacao (external_id). Não é possível cancelar no banco.',
        localStatus: localBefore,
        remoteStatus: null,
        disposition: 'block_non_removable',
        externalId: null,
      });
      continue;
    }

    let remoteStatus: string | null = null;
    let disposition: ReleaseInterDisposition = 'block_non_removable';

    try {
      const secrets = await secretsLoader(admin, companyId, {
        integrationId: (localRow as { integration_id?: string | null }).integration_id
          ? String((localRow as { integration_id?: string }).integration_id)
          : null,
        financialAccountId: (localRow as { financial_account_id?: string | null })
          .financial_account_id
          ? String(
              (localRow as { financial_account_id?: string }).financial_account_id,
            )
          : null,
      });
      if (!secrets) {
        throw new Error('Credenciais Inter ausentes para cancelar a cobrança.');
      }
      const creds = {
        companyId,
        integrationId: secrets.integrationId,
        environment: secrets.environment,
        clientId: secrets.clientId,
        clientSecret: secrets.clientSecret,
        certificatePem: secrets.certificatePem,
        privateKeyPem: secrets.privateKeyPem,
      };
      const detail = await fetchInterCobrancaByCodigo(creds, externalId, {
        fetchFn: options?.fetchFn,
      });
      remoteStatus = normalizeInterSituacaoForRelease(detail.situacao);
      disposition = classifyRemoteInterSituacaoForRelease(detail.situacao);

      console.log('[releaseLot][inter] synced', {
        chargeId: chargeId.slice(0, 8),
        externalId,
        localBefore,
        remoteStatus,
        disposition,
      });

      if (disposition === 'preserve_paid') {
        preservedPaid += 1;
        continue;
      }
      if (disposition === 'already_cancelled') {
        alreadyCancelled += 1;
        await markLocalInterCancelled(admin, companyId, chargeId, remoteStatus);
        continue;
      }
      if (disposition === 'block_non_removable') {
        failed.push({
          chargeId,
          error: `Cobrança Inter com situação remota "${remoteStatus || 'desconhecida'}" não é cancelável. Local era ${localBefore}.`,
          localStatus: localBefore,
          remoteStatus,
          disposition,
          externalId,
        });
        continue;
      }

      cancelableIds.push(chargeId);
      if (!executeCancel) continue;

      await cancelInterCobranca(creds, externalId, {
        fetchFn: options?.fetchFn,
        motivoCancelamento: motivo,
      });
      await markLocalInterCancelled(admin, companyId, chargeId, 'CANCELADO');
      cancelled += 1;
      console.log('[releaseLot][inter] cancelled', {
        chargeId: chargeId.slice(0, 8),
        externalId,
        motivo,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failed.push({
        chargeId,
        error: msg,
        localStatus: localBefore,
        remoteStatus,
        disposition: disposition === 'cancel' ? 'cancel' : 'block_non_removable',
        externalId,
      });
      console.warn('[releaseLot][inter] sync_or_cancel_failed', {
        chargeId: chargeId.slice(0, 8),
        externalId,
        error: msg,
      });
    }
  }

  return {
    cancelableIds,
    cancelled,
    preservedPaid,
    alreadyCancelled,
    failed,
  };
}

export async function listOpenInterBankChargeIdsForSale(
  admin: SupabaseClient,
  companyId: string,
  saleId: string,
): Promise<
  Array<{
    id: string;
    status: string;
    external_id: string | null;
    finance_receipt_id: string | null;
  }>
> {
  const { data, error } = await admin
    .from('bank_charges')
    .select('id, status, external_id, finance_receipt_id')
    .eq('company_id', companyId)
    .eq('provider', 'INTER')
    .eq('sale_id', saleId);
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    id: String(row.id),
    status: String(row.status || ''),
    external_id: row.external_id ? String(row.external_id) : null,
    finance_receipt_id: row.finance_receipt_id
      ? String(row.finance_receipt_id)
      : null,
  }));
}
