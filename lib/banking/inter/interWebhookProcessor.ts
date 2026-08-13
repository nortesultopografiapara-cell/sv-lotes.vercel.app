/**
 * Processamento isolado de webhook Inter (após receptor mTLS + HMAC).
 * NÃO usa company_asaas_* / handlers Asaas.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchInterCobrancaByCodigo,
  isInterSituacaoRecebido,
  normalizeInterCobrancaDetail,
  type InterCobrancaDetail,
} from '@/lib/banking/inter/interCobrancaClient';
import { loadInterSecretsForServer } from '@/lib/banking/inter/interConfigRepository';
import type { InterOAuthFetchFn } from '@/lib/banking/inter/interOAuthClient';
import { refreshInterChargeArtifacts } from '@/lib/banking/inter/interSaleChargeService';
import { settleInterPaidCharge } from '@/lib/banking/inter/interPaymentSettlement';

export function buildInterWebhookIdempotencyKey(input: {
  codigoSolicitacao: string;
  situacao: string;
  dataHoraSituacao?: string | null;
}): string {
  const codigo = String(input.codigoSolicitacao || '').trim();
  const situacao = String(input.situacao || '').trim().toUpperCase() || 'UNKNOWN';
  const when = String(input.dataHoraSituacao || '').trim() || 'na';
  return `INTER:${codigo}:${situacao}:${when}`;
}

export type InterWebhookCallbackItem = {
  codigoSolicitacao?: string;
  idSolicitacao?: string;
  situacao?: string;
  dataHoraSituacao?: string;
  valorNominal?: number;
  valorTotalRecebimento?: number;
  origemRecebimento?: string;
  [key: string]: unknown;
};

export function extractInterCallbackItems(payload: unknown): InterWebhookCallbackItem[] {
  if (Array.isArray(payload)) return payload as InterWebhookCallbackItem[];
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.items)) return obj.items as InterWebhookCallbackItem[];
    if (Array.isArray(obj.cobrancas)) return obj.cobrancas as InterWebhookCallbackItem[];
    return [obj as InterWebhookCallbackItem];
  }
  return [];
}

export function resolveCodigoSolicitacao(item: InterWebhookCallbackItem): string {
  return String(item.codigoSolicitacao || item.idSolicitacao || '').trim();
}

export type InterWebhookProcessResult = {
  ok: boolean;
  duplicate: boolean;
  ignored: boolean;
  paid: boolean;
  message: string;
  codigoSolicitacao?: string;
  bankChargeId?: string | null;
  financeReceiptId?: string | null;
  cashMovementId?: string | null;
  origemRecebimento?: string | null;
};

async function claimDbIdempotency(
  admin: SupabaseClient,
  input: {
    companyId: string;
    integrationId: string | null;
    idempotencyKey: string;
    eventType: string;
    payload: Record<string, unknown>;
  },
): Promise<{ claimed: boolean; eventId: string | null }> {
  const { data, error } = await admin
    .from('bank_webhook_events')
    .insert({
      company_id: input.companyId,
      integration_id: input.integrationId,
      provider: 'INTER',
      event_type: input.eventType,
      external_event_id: input.idempotencyKey,
      payload: input.payload,
      signature_valid: true,
      processing_status: 'PENDING',
      idempotency_key: input.idempotencyKey,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    if (String(error.message || '').toLowerCase().includes('duplicate') || error.code === '23505') {
      return { claimed: false, eventId: null };
    }
    throw new Error(error.message);
  }
  return { claimed: true, eventId: data?.id ? String(data.id) : null };
}

async function markWebhookEvent(
  admin: SupabaseClient,
  eventId: string | null,
  status: 'PROCESSED' | 'IGNORED' | 'FAILED' | 'DUPLICATE',
  errorMessage?: string,
): Promise<void> {
  if (!eventId) return;
  await admin
    .from('bank_webhook_events')
    .update({
      processing_status: status,
      processed_at: new Date().toISOString(),
      error_message: errorMessage ? String(errorMessage).slice(0, 500) : null,
    })
    .eq('id', eventId);
}

export async function processInterWebhookCallbackItem(
  admin: SupabaseClient,
  input: {
    companyId: string;
    item: InterWebhookCallbackItem;
    receiverMeta?: Record<string, unknown>;
    fetchFn?: InterOAuthFetchFn;
    /** Injeção de confirmação (testes). */
    confirmCharge?: (codigo: string) => Promise<InterCobrancaDetail>;
  },
): Promise<InterWebhookProcessResult> {
  const codigo = resolveCodigoSolicitacao(input.item);
  const situacaoHint = String(input.item.situacao || '').trim().toUpperCase();
  const dataHoraHint = input.item.dataHoraSituacao
    ? String(input.item.dataHoraSituacao)
    : null;

  if (!codigo) {
    return {
      ok: false,
      duplicate: false,
      ignored: true,
      paid: false,
      message: 'Callback sem codigoSolicitacao.',
    };
  }

  const { data: integration } = await admin
    .from('bank_integrations')
    .select('id')
    .eq('company_id', input.companyId)
    .eq('provider', 'INTER')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const integrationId = integration?.id ? String(integration.id) : null;

  // Idempotência preliminar com hint do callback; se RECEBIDO, reforça após GET.
  const prelimKey = buildInterWebhookIdempotencyKey({
    codigoSolicitacao: codigo,
    situacao: situacaoHint || 'CALLBACK',
    dataHoraSituacao: dataHoraHint,
  });

  const claim = await claimDbIdempotency(admin, {
    companyId: input.companyId,
    integrationId,
    idempotencyKey: prelimKey,
    eventType: `INTER_CALLBACK_${situacaoHint || 'UNKNOWN'}`,
    payload: {
      item: sanitizeCallbackForStorage(input.item),
      receiver: input.receiverMeta || null,
    },
  });

  if (!claim.claimed) {
    return healDuplicateInterWebhook(admin, input, codigo);
  }

  try {
    // Atualiza metadata de integração (último callback)
    if (integrationId) {
      await touchInterWebhookMeta(admin, integrationId, input.companyId, {
        lastNotificationAt: new Date().toISOString(),
        lastNotificationCodigo: codigo,
        lastNotificationSituacao: situacaoHint || null,
        lastError: null,
      });
    }

    if (situacaoHint && !isInterSituacaoRecebido(situacaoHint) && situacaoHint !== '') {
      // Ainda confirma via GET se possível; senão ignora status não final
      // Continua para GET quando possível.
    }

    const secrets = input.confirmCharge
      ? null
      : await loadInterSecretsForServer(admin, input.companyId);
    if (!input.confirmCharge && !secrets) {
      await markWebhookEvent(admin, claim.eventId, 'FAILED', 'Credenciais Inter ausentes');
      return {
        ok: false,
        duplicate: false,
        ignored: false,
        paid: false,
        message: 'Credenciais Inter ausentes para confirmação GET.',
        codigoSolicitacao: codigo,
      };
    }

    const confirmed = input.confirmCharge
      ? await input.confirmCharge(codigo)
      : await fetchInterCobrancaByCodigo(
          {
            companyId: input.companyId,
            environment: secrets!.environment,
            clientId: secrets!.clientId,
            clientSecret: secrets!.clientSecret,
            certificatePem: secrets!.certificatePem,
            privateKeyPem: secrets!.privateKeyPem,
          },
          codigo,
          { fetchFn: input.fetchFn },
        );

    // Segunda chave canônica pós-GET
    const finalKey = buildInterWebhookIdempotencyKey({
      codigoSolicitacao: confirmed.codigoSolicitacao || codigo,
      situacao: confirmed.situacao,
      dataHoraSituacao: confirmed.dataHoraSituacao,
    });

    if (finalKey !== prelimKey) {
      const finalClaim = await claimDbIdempotency(admin, {
        companyId: input.companyId,
        integrationId,
        idempotencyKey: finalKey,
        eventType: `INTER_CONFIRMED_${confirmed.situacao}`,
        payload: { confirmed: sanitizeConfirmedForStorage(confirmed) },
      });
      if (!finalClaim.claimed) {
        await markWebhookEvent(admin, claim.eventId, 'DUPLICATE');
        return settleConfirmedRecebidoAfterDuplicate(admin, input.companyId, codigo, confirmed);
      }
      await markWebhookEvent(admin, finalClaim.eventId, 'PROCESSED');
    }

    if (!isInterSituacaoRecebido(confirmed.situacao)) {
      try {
        await refreshInterChargeArtifacts(admin, {
          companyId: input.companyId,
          externalId: codigo,
          detail: confirmed,
        });
      } catch {
        /* materialização best-effort — não muda semântica de ignore/sem baixa */
      }
      await markWebhookEvent(admin, claim.eventId, 'IGNORED', `situacao=${confirmed.situacao}`);
      return {
        ok: true,
        duplicate: false,
        ignored: true,
        paid: false,
        message: `Status não final (${confirmed.situacao}) — sem baixa.`,
        codigoSolicitacao: codigo,
      };
    }

    const { data: charge } = await admin
      .from('bank_charges')
      .select(
        'id, company_id, finance_receipt_id, sale_id, customer_id, status, amount, metadata, paid_at, paid_amount, external_id, barcode, digitable_line, pix_copy_paste, our_number, txid',
      )
      .eq('company_id', input.companyId)
      .eq('provider', 'INTER')
      .eq('external_id', codigo)
      .maybeSingle();

    if (!charge?.id) {
      await markWebhookEvent(admin, claim.eventId, 'IGNORED', 'bank_charge não encontrado');
      return {
        ok: true,
        duplicate: false,
        ignored: true,
        paid: false,
        message: 'Cobrança Inter desconhecida no SV LOTES (bank_charges).',
        codigoSolicitacao: codigo,
      };
    }

    const settled = await settleInterPaidCharge(admin, {
      companyId: input.companyId,
      charge: charge as Record<string, unknown>,
      detail: confirmed,
      webhookEventId: claim.eventId,
    });

    if (settled.duplicate) {
      await markWebhookEvent(admin, claim.eventId, 'DUPLICATE');
      return {
        ok: true,
        duplicate: true,
        ignored: false,
        paid: true,
        message: 'Cobrança já estava PAID.',
        codigoSolicitacao: codigo,
        bankChargeId: settled.bankChargeId,
        financeReceiptId: settled.financeReceiptId,
        cashMovementId: settled.cashMovementId,
        origemRecebimento: settled.origemRecebimento,
      };
    }

    await markWebhookEvent(admin, claim.eventId, 'PROCESSED');
    return {
      ok: true,
      duplicate: false,
      ignored: false,
      paid: true,
      message: 'Cobrança confirmada via GET e baixada.',
      codigoSolicitacao: codigo,
      bankChargeId: settled.bankChargeId,
      financeReceiptId: settled.financeReceiptId,
      cashMovementId: settled.cashMovementId,
      origemRecebimento: settled.origemRecebimento,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro no processamento Inter.';
    await markWebhookEvent(admin, claim.eventId, 'FAILED', message);
    if (integrationId) {
      await touchInterWebhookMeta(admin, integrationId, input.companyId, {
        lastError: message.slice(0, 300),
      });
    }
    return {
      ok: false,
      duplicate: false,
      ignored: false,
      paid: false,
      message,
      codigoSolicitacao: codigo,
    };
  }
}

async function loadInterChargeByCodigo(
  admin: SupabaseClient,
  companyId: string,
  codigo: string,
): Promise<Record<string, unknown> | null> {
  const { data: charge } = await admin
    .from('bank_charges')
    .select(
      'id, company_id, finance_receipt_id, sale_id, customer_id, status, amount, metadata, paid_at, paid_amount, external_id, barcode, digitable_line, pix_copy_paste, our_number, txid',
    )
    .eq('company_id', companyId)
    .eq('provider', 'INTER')
    .eq('external_id', codigo)
    .maybeSingle();
  return charge?.id ? (charge as Record<string, unknown>) : null;
}

async function settleConfirmedRecebidoAfterDuplicate(
  admin: SupabaseClient,
  companyId: string,
  codigo: string,
  confirmed: InterCobrancaDetail,
): Promise<InterWebhookProcessResult> {
  const base: InterWebhookProcessResult = {
    ok: true,
    duplicate: true,
    ignored: false,
    paid: false,
    message: 'Callback duplicado — nenhuma baixa adicional.',
    codigoSolicitacao: codigo,
  };
  if (!isInterSituacaoRecebido(confirmed.situacao)) {
    return {
      ...base,
      ignored: true,
      message: 'Callback duplicado — status não final.',
    };
  }
  const charge = await loadInterChargeByCodigo(admin, companyId, codigo);
  if (!charge) {
    return {
      ...base,
      ignored: true,
      message: 'Callback duplicado — cobrança local não encontrada.',
    };
  }
  const settled = await settleInterPaidCharge(admin, {
    companyId,
    charge,
    detail: confirmed,
  });
  return {
    ...base,
    paid: settled.paid,
    message: settled.receiptUpdated
      ? 'Callback duplicado — parcela sincronizada.'
      : 'Callback duplicado — nenhuma baixa adicional.',
    bankChargeId: settled.bankChargeId,
    financeReceiptId: settled.financeReceiptId,
    cashMovementId: settled.cashMovementId,
    origemRecebimento: settled.origemRecebimento,
  };
}

async function healDuplicateInterWebhook(
  admin: SupabaseClient,
  input: {
    companyId: string;
    item: InterWebhookCallbackItem;
    fetchFn?: InterOAuthFetchFn;
    confirmCharge?: (codigo: string) => Promise<InterCobrancaDetail>;
  },
  codigo: string,
): Promise<InterWebhookProcessResult> {
  const fallback: InterWebhookProcessResult = {
    ok: true,
    duplicate: true,
    ignored: false,
    paid: false,
    message: 'Callback duplicado — nenhuma baixa adicional.',
    codigoSolicitacao: codigo,
  };
  try {
    if (!input.confirmCharge) {
      const secrets = await loadInterSecretsForServer(admin, input.companyId);
      if (!secrets) return fallback;
      const confirmed = await fetchInterCobrancaByCodigo(
        {
          companyId: input.companyId,
          environment: secrets.environment,
          clientId: secrets.clientId,
          clientSecret: secrets.clientSecret,
          certificatePem: secrets.certificatePem,
          privateKeyPem: secrets.privateKeyPem,
        },
        codigo,
        { fetchFn: input.fetchFn },
      );
      return settleConfirmedRecebidoAfterDuplicate(admin, input.companyId, codigo, confirmed);
    }
    const confirmed = await input.confirmCharge(codigo);
    return settleConfirmedRecebidoAfterDuplicate(admin, input.companyId, codigo, confirmed);
  } catch {
    return fallback;
  }
}

function sanitizeCallbackForStorage(item: InterWebhookCallbackItem): Record<string, unknown> {
  return {
    codigoSolicitacao: resolveCodigoSolicitacao(item),
    situacao: item.situacao || null,
    dataHoraSituacao: item.dataHoraSituacao || null,
    origemRecebimento: item.origemRecebimento || null,
    valorNominal: item.valorNominal ?? null,
    valorTotalRecebimento: item.valorTotalRecebimento ?? null,
  };
}

function sanitizeConfirmedForStorage(detail: InterCobrancaDetail): Record<string, unknown> {
  return {
    codigoSolicitacao: detail.codigoSolicitacao,
    situacao: detail.situacao,
    dataHoraSituacao: detail.dataHoraSituacao,
    origemRecebimento: detail.origemRecebimento,
    valorTotalRecebido: detail.valorTotalRecebido ?? null,
    valorNominal: detail.valorNominal ?? null,
  };
}

async function touchInterWebhookMeta(
  admin: SupabaseClient,
  integrationId: string,
  companyId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { data } = await admin
    .from('bank_integrations')
    .select('metadata')
    .eq('id', integrationId)
    .eq('company_id', companyId)
    .eq('provider', 'INTER')
    .maybeSingle();
  const prev =
    data?.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {};
  const webhook = {
    ...((prev.webhook as Record<string, unknown>) || {}),
    ...patch,
  };
  await admin
    .from('bank_integrations')
    .update({
      metadata: { ...prev, webhook },
      updated_at: new Date().toISOString(),
    })
    .eq('id', integrationId)
    .eq('company_id', companyId)
    .eq('provider', 'INTER');
}

export { normalizeInterCobrancaDetail };
