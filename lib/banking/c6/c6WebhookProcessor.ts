/**
 * Receptor C6. A notificação só indica o boleto.
 * PAID consulta GET /v1/bank_slips/{id} e baixa pela RPC já instalada.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { readC6EmissionEnabled } from '@/lib/banking/c6/c6EmissionAuthorization';
import {
  readConfirmedC6Payment,
  readOfficialC6BankSlip,
  settleC6PaidSlip,
} from '@/lib/banking/c6/c6PaymentSettlement';
import { findC6IntegrationByReceiptToken, type C6WebhookIntegration } from '@/lib/banking/c6/c6WebhookReceipt';
import {
  buildC6WebhookIdempotencyKey,
  parseC6WebhookNotification,
  redactC6WebhookPayload,
  sameSecret,
  type C6WebhookNotice,
} from '@/lib/banking/c6/c6WebhookNotification';

export type C6WebhookProcessResult = {
  status: number;
  body: { accepted: boolean; duplicate?: boolean; informational?: boolean; paid?: boolean; error?: string };
};

export type C6WebhookSlipConfirmation = {
  httpStatus: number;
  body: unknown;
};

const lanes = new Map<string, Promise<unknown>>();

export async function processC6WebhookNotification(
  admin: SupabaseClient,
  input: {
    receiptToken: string;
    body: unknown;
    now?: Date;
    confirmSlip?: (input: {
      integration: C6WebhookIntegration;
      bankSlipId: string;
    }) => Promise<C6WebhookSlipConfirmation>;
  },
): Promise<C6WebhookProcessResult> {
  const parsed = parseC6WebhookNotification(input.body);
  if (!parsed.ok) {
    return { status: 400, body: { accepted: false, error: parsed.reason } };
  }
  const integration = await findC6IntegrationByReceiptToken(admin, input.receiptToken);
  if (!integration?.companyId || !integration.id) {
    return { status: 404, body: { accepted: false, error: 'Notificação recusada.' } };
  }
  if (!sameSecret(integration.clientId, parsed.notice.clientId)) {
    return { status: 422, body: { accepted: false, error: 'Notificação C6 não pertence a esta integração.' } };
  }
  const key = buildC6WebhookIdempotencyKey({ integrationId: integration.id, notice: parsed.notice });
  const previous = lanes.get(key) || Promise.resolve();
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  lanes.set(
    key,
    previous.then(() => gate),
  );
  await previous;
  try {
    return await handleNotice(admin, integration, parsed.notice, key, input.now || new Date(), input.confirmSlip);
  } finally {
    release();
  }
}

async function handleNotice(
  admin: SupabaseClient,
  integration: C6WebhookIntegration,
  notice: C6WebhookNotice,
  key: string,
  now: Date,
  confirmSlip?: (input: {
    integration: C6WebhookIntegration;
    bankSlipId: string;
  }) => Promise<C6WebhookSlipConfirmation>,
): Promise<C6WebhookProcessResult> {
  const recent = await countRecent(admin, integration);
  if (recent >= 30) {
    return { status: 429, body: { accepted: false, error: 'Muitas notificações.' } };
  }
  const claim = await claimEvent(admin, integration, notice, key);
  if (claim.mode === 'duplicate') {
    return { status: 200, body: { accepted: true, duplicate: true } };
  }
  if (claim.mode === 'foreign') {
    return { status: 422, body: { accepted: false, error: 'Notificação C6 não pertence a esta empresa.' } };
  }

  try {
    if (notice.status !== 'PAID') {
      await mark(admin, claim.eventId, 'PROCESSED', null, now);
      return { status: 200, body: { accepted: true, informational: true, paid: false } };
    }
    if (!readC6EmissionEnabled(integration.metadata)) {
      await mark(admin, claim.eventId, 'IGNORED', 'Emissão C6 desativada para esta empresa.', now);
      return { status: 200, body: { accepted: true, informational: true, paid: false } };
    }
    const charge = await loadCharge(admin, integration, notice.externalId);
    if (!charge) {
      await mark(admin, claim.eventId, 'IGNORED', 'Cobrança C6 não encontrada nesta empresa.', now);
      return { status: 200, body: { accepted: true, informational: true, paid: false } };
    }
    if (!confirmSlip) {
      await mark(admin, claim.eventId, 'FAILED', 'Consulta oficial do boleto C6 indisponível.', now);
      return { status: 503, body: { accepted: false, error: 'Consulta oficial do boleto C6 indisponível.' } };
    }
    let confirmation: C6WebhookSlipConfirmation;
    try {
      confirmation = await confirmSlip({ integration, bankSlipId: notice.externalId });
    } catch {
      await mark(admin, claim.eventId, 'FAILED', 'Falha temporária ao consultar o boleto C6.', now);
      return { status: 503, body: { accepted: false, error: 'Falha temporária ao consultar o boleto C6.' } };
    }
    if (confirmation.httpStatus === 429 || confirmation.httpStatus >= 500) {
      await mark(admin, claim.eventId, 'FAILED', 'Falha temporária ao consultar o boleto C6.', now);
      return { status: 503, body: { accepted: false, error: 'Falha temporária ao consultar o boleto C6.' } };
    }
    const slip = readOfficialC6BankSlip(confirmation.body);
    const confirmed = slip ? readConfirmedC6Payment(slip) : null;
    if (!slip || String(slip.status || '').toUpperCase() !== 'PAID' || !confirmed || slip.id !== notice.externalId) {
      await mark(admin, claim.eventId, 'IGNORED', 'Pagamento C6 não confirmado na consulta oficial.', now);
      return { status: 200, body: { accepted: true, informational: true, paid: false } };
    }
    const settlement = await settleC6PaidSlip(admin, {
      companyId: integration.companyId,
      charge,
      slip,
    });
    if (settlement.paid && settlement.duplicate) {
      await mark(admin, claim.eventId, 'DUPLICATE', null, now);
      return { status: 200, body: { accepted: true, duplicate: true, paid: true } };
    }
    if (settlement.paid) {
      await mark(admin, claim.eventId, 'PROCESSED', null, now);
      return { status: 200, body: { accepted: true, paid: true } };
    }
    await mark(admin, claim.eventId, 'IGNORED', settlement.message, now);
    return { status: 200, body: { accepted: true, informational: true, paid: false } };
  } catch {
    await mark(admin, claim.eventId, 'FAILED', 'Falha ao processar a notificação C6.', now);
    return { status: 503, body: { accepted: false, error: 'Falha ao processar a notificação C6.' } };
  }
}

async function countRecent(admin: SupabaseClient, integration: C6WebhookIntegration): Promise<number> {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { data, error } = await admin
    .from('bank_webhook_events')
    .select('id, company_id, integration_id, provider, created_at')
    .eq('company_id', integration.companyId)
    .eq('integration_id', integration.id)
    .eq('provider', 'C6');
  if (error) throw new Error(error.message);
  return (data || []).filter((row) => {
    return (
      String(row.company_id || '') === integration.companyId &&
      String(row.integration_id || '') === integration.id &&
      String(row.provider || '') === 'C6' &&
      String(row.created_at || '') >= since
    );
  }).length;
}

async function claimEvent(
  admin: SupabaseClient,
  integration: C6WebhookIntegration,
  notice: C6WebhookNotice,
  key: string,
): Promise<{ mode: 'new' | 'resume' | 'duplicate' | 'foreign'; eventId: string | null }> {
  const payload = redactC6WebhookPayload(notice);
  const { data, error } = await admin
    .from('bank_webhook_events')
    .insert({
      company_id: integration.companyId,
      integration_id: integration.id,
      provider: 'C6',
      event_type: `C6_BANK_SLIP_${notice.status}`,
      external_event_id: notice.externalId,
      payload,
      signature_valid: false,
      processing_status: 'PENDING',
      idempotency_key: key,
    })
    .select('id')
    .maybeSingle();
  if (!error) return { mode: 'new', eventId: data?.id ? String(data.id) : null };
  const duplicate = error.code === '23505' || /duplicate|unique/i.test(String(error.message || ''));
  if (!duplicate) throw new Error(error.message);
  const { data: existing, error: readError } = await admin
    .from('bank_webhook_events')
    .select('id, company_id, integration_id, processing_status, idempotency_key')
    .eq('idempotency_key', key)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!existing?.id) return { mode: 'duplicate', eventId: null };
  if (
    String(existing.company_id || '') !== integration.companyId ||
    String(existing.integration_id || '') !== integration.id
  ) {
    return { mode: 'foreign', eventId: null };
  }
  const status = String(existing.processing_status || '');
  if (status === 'FAILED' || status === 'PENDING') {
    await admin
      .from('bank_webhook_events')
      .update({ processing_status: 'PENDING', error_message: null })
      .eq('id', existing.id)
      .eq('company_id', integration.companyId);
    return { mode: 'resume', eventId: String(existing.id) };
  }
  return { mode: 'duplicate', eventId: String(existing.id) };
}

async function loadCharge(
  admin: SupabaseClient,
  integration: C6WebhookIntegration,
  externalId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await admin
    .from('bank_charges')
    .select('*')
    .eq('company_id', integration.companyId)
    .eq('provider', 'C6')
    .eq('integration_id', integration.id)
    .eq('external_id', externalId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) return null;
  if (
    String(data.company_id || '') !== integration.companyId ||
    String(data.provider || '') !== 'C6' ||
    String(data.integration_id || '') !== integration.id ||
    String(data.external_id || '') !== externalId
  ) {
    return null;
  }
  return data as Record<string, unknown>;
}

async function mark(
  admin: SupabaseClient,
  eventId: string | null,
  status: 'PROCESSED' | 'IGNORED' | 'FAILED' | 'DUPLICATE',
  message: string | null,
  now: Date,
): Promise<void> {
  if (!eventId) return;
  await admin
    .from('bank_webhook_events')
    .update({
      processing_status: status,
      processed_at: now.toISOString(),
      error_message: message ? message.slice(0, 180) : null,
    })
    .eq('id', eventId);
}
