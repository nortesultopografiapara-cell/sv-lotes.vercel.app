/**
 * Liquidação Asaas → Conta a Receber + Caixa Corporativo (Fase 7.3).
 * Idempotente · nunca processa SaaS/tenant.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { receiveReceivable } from '../receivablesService';
import { logCorporateFinanceAudit } from '../service';
import {
  isCorporateAsaasDomain,
  parseCorporateAsaasExternalReference,
  MASTER_CORPORATE_ASAAS_DOMAIN,
} from './domain';
import {
  mapAsaasRemoteStatusToLocal,
  hasCorporateAsaasPaymentEvidence,
  shouldSettleCorporateAsaasPayment,
  resolveCorporateAsaasPaymentDate,
  type CorporateAsaasPaymentRemote,
} from './client';
import { mapCorporateAsaasChargeRow } from './mappers';
import {
  canDowngradeCorporateAsaasStatus,
  isCorporateAsaasPaidStatus,
  type MasterCorporateAsaasCharge,
} from './types';
import {
  sanitizeCorporateAsaasErrorMessage,
  sanitizeCorporateAsaasPayload,
} from './validation';

function nowIso() {
  return new Date().toISOString();
}

function logCorporateAsaasWebhook(
  step: string,
  meta: Record<string, unknown> = {},
): void {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined) continue;
    safe[key] = value;
  }
  console.info(`[corporate-asaas-webhook] ${step}`, safe);
}

function extractPaymentFromWebhookBody(
  body: Record<string, unknown>,
): CorporateAsaasPaymentRemote | null {
  const payment = body.payment;
  if (payment && typeof payment === 'object') {
    return payment as CorporateAsaasPaymentRemote;
  }
  if (body.id && (body.status || body.billingType)) {
    return body as CorporateAsaasPaymentRemote;
  }
  return null;
}

function resolveEventId(body: Record<string, unknown>, paymentId: string | null): string {
  const direct = String(body.id || body.eventId || '').trim();
  if (direct && direct !== paymentId) return direct;
  const event = String(body.event || 'UNKNOWN').trim();
  const date = String(body.dateCreated || nowIso()).trim();
  return `MCF_EVT:${event}:${paymentId || 'none'}:${date}`;
}

async function findCharge(
  supabase: SupabaseClient,
  payment: CorporateAsaasPaymentRemote,
): Promise<MasterCorporateAsaasCharge | null> {
  const paymentId = payment.id ? String(payment.id) : '';
  if (paymentId) {
    const { data, error } = await supabase
      .from('master_corporate_asaas_charges')
      .select('*')
      .eq('asaas_payment_id', paymentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return mapCorporateAsaasChargeRow(data as Record<string, unknown>);
  }

  const ext = String(payment.externalReference || '').trim();
  if (ext.startsWith('ASAAS_CORP_AR:') || ext.startsWith('MCF:')) {
    const { data, error } = await supabase
      .from('master_corporate_asaas_charges')
      .select('*')
      .eq('external_reference', ext)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return mapCorporateAsaasChargeRow(data as Record<string, unknown>);

    const parsed = parseCorporateAsaasExternalReference(ext);
    if (parsed?.suffix) {
      const { data: byId, error: byIdError } = await supabase
        .from('master_corporate_asaas_charges')
        .select('*')
        .eq('id', parsed.suffix)
        .eq('receivable_id', parsed.receivableId)
        .maybeSingle();
      if (byIdError) throw new Error(byIdError.message);
      if (byId) return mapCorporateAsaasChargeRow(byId as Record<string, unknown>);
    }
  }
  return null;
}

async function insertWebhookEvent(
  supabase: SupabaseClient,
  row: {
    event_id: string;
    event_type: string;
    asaas_payment_id: string | null;
    charge_id: string | null;
    receivable_id: string | null;
    external_reference: string | null;
    processing_status: string;
    payload_sanitized: Record<string, unknown>;
    error_message?: string | null;
    processed_at?: string | null;
  },
): Promise<{ id: string; duplicate: boolean }> {
  const { data, error } = await supabase
    .from('master_corporate_asaas_webhook_events')
    .insert({
      ...row,
      domain: MASTER_CORPORATE_ASAAS_DOMAIN,
      attempts: 1,
      created_at: nowIso(),
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { id: '', duplicate: true };
    }
    throw new Error(error.message);
  }
  return { id: String(data.id), duplicate: false };
}

async function loadWebhookEventByEventId(
  supabase: SupabaseClient,
  eventId: string,
): Promise<{
  id: string;
  processing_status: string;
  attempts: number;
} | null> {
  const { data, error } = await supabase
    .from('master_corporate_asaas_webhook_events')
    .select('id, processing_status, attempts')
    .eq('event_id', eventId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: String(data.id),
    processing_status: String(data.processing_status || ''),
    attempts: Number(data.attempts || 1),
  };
}

/** Liquidação idempotente — usado por webhook e sync/conciliação. */
export async function settleCorporateAsaasChargeFromRemote(
  supabase: SupabaseClient,
  charge: MasterCorporateAsaasCharge,
  payment: CorporateAsaasPaymentRemote,
  localStatus: MasterCorporateAsaasCharge['local_status'],
): Promise<{ charge: MasterCorporateAsaasCharge; settled: boolean }> {
  if (!isCorporateAsaasPaidStatus(localStatus)) {
    return { charge, settled: false };
  }
  if (charge.receivable_payment_id) {
    return { charge, settled: false };
  }

  // Valor quitado do cliente = value (não netValue/taxas)
  const amount = Number(payment.value != null ? payment.value : charge.original_value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Valor pago Asaas inválido.');
  }

  const paymentDate = String(
    resolveCorporateAsaasPaymentDate(payment) || nowIso(),
  ).slice(0, 10);

  const idempotencyKey = `ASAAS_CORP:${charge.asaas_payment_id}`;

  let paymentId: string | null = null;
  let cashMovementId: string | null = charge.cash_movement_id;

  try {
    const result = await receiveReceivable(
      supabase,
      charge.receivable_id,
      {
        financial_account_id: charge.financial_account_id,
        payment_date: paymentDate,
        amount,
        payment_method: charge.billing_type === 'BOLETO' ? 'BOLETO' : 'PIX',
        reference: charge.asaas_payment_id,
        notes: `Asaas ${charge.billing_type} ${charge.asaas_payment_id}`,
        origin: 'ASAAS',
        idempotency_key: idempotencyKey,
      },
      null,
    );
    paymentId = result.payment.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('duplicado') || msg.includes('idempot')) {
      const { data: existingPay } = await supabase
        .from('master_corporate_receivable_payments')
        .select('id')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      paymentId = existingPay?.id ? String(existingPay.id) : null;
    } else if (
      msg.includes('já liquidado') ||
      msg.includes('saldo pendente') ||
      msg.includes('Valor maior')
    ) {
      // AR já quitada por outro caminho — só espelha vínculos se houver pagamento ASAAS
      const { data: existingPay } = await supabase
        .from('master_corporate_receivable_payments')
        .select('id')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      paymentId = existingPay?.id ? String(existingPay.id) : null;
      if (!paymentId) {
        // Atualiza status da cobrança sem criar segundo recebimento
        const { data, error } = await supabase
          .from('master_corporate_asaas_charges')
          .update({
            local_status: localStatus,
            asaas_status: payment.status || null,
            net_value: payment.netValue != null ? Number(payment.netValue) : charge.net_value,
            paid_at: charge.paid_at || payment.paymentDate || payment.clientPaymentDate || nowIso(),
            confirmed_at:
              localStatus === 'CONFIRMED'
                ? charge.confirmed_at || payment.confirmedDate || nowIso()
                : charge.confirmed_at,
            last_sync_at: nowIso(),
            last_error: 'AR já liquidada; cobrança marcada paga sem novo recebimento',
            updated_at: nowIso(),
          })
          .eq('id', charge.id)
          .select('*')
          .single();
        if (error) throw new Error(error.message);
        return {
          charge: mapCorporateAsaasChargeRow(data as Record<string, unknown>),
          settled: false,
        };
      }
    } else {
      throw err;
    }
  }

  if (paymentId) {
    const { data: mov } = await supabase
      .from('master_corporate_cash_movements')
      .select('id')
      .eq('idempotency_key', `RECEIVABLE_PAYMENT:${paymentId}`)
      .maybeSingle();
    if (mov?.id) cashMovementId = String(mov.id);
  }

  const { data, error } = await supabase
    .from('master_corporate_asaas_charges')
    .update({
      local_status: localStatus,
      asaas_status: payment.status || null,
      net_value: payment.netValue != null ? Number(payment.netValue) : charge.net_value,
      paid_at: charge.paid_at || payment.paymentDate || payment.clientPaymentDate || nowIso(),
      confirmed_at:
        localStatus === 'CONFIRMED'
          ? charge.confirmed_at || payment.confirmedDate || nowIso()
          : charge.confirmed_at,
      receivable_payment_id: paymentId || charge.receivable_payment_id,
      cash_movement_id: cashMovementId,
      invoice_url: payment.invoiceUrl || charge.invoice_url,
      bank_slip_url: payment.bankSlipUrl || charge.bank_slip_url,
      transaction_receipt_url:
        payment.transactionReceiptUrl || charge.transaction_receipt_url,
      last_sync_at: nowIso(),
      last_error: null,
      updated_at: nowIso(),
    })
    .eq('id', charge.id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  await supabase
    .from('master_corporate_receivables')
    .update({
      asaas_integration_status: localStatus,
      asaas_active_charge_id: charge.id,
      asaas_last_sync_at: nowIso(),
      asaas_last_error: null,
      updated_at: nowIso(),
    })
    .eq('id', charge.receivable_id);

  return {
    charge: mapCorporateAsaasChargeRow(data as Record<string, unknown>),
    settled: Boolean(paymentId),
  };
}

/**
 * Processa webhook corporativo. Retorna status HTTP-friendly.
 */
export async function processCorporateAsaasWebhook(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
): Promise<{
  ok: boolean;
  status: number;
  result: string;
  message?: string;
}> {
  const eventType = String(body.event || 'UNKNOWN').trim();
  const payment = extractPaymentFromWebhookBody(body);
  const paymentId = payment?.id ? String(payment.id) : null;
  const eventId = resolveEventId(body, paymentId);
  const sanitized = sanitizeCorporateAsaasPayload(body);

  logCorporateAsaasWebhook('event received', {
    event: eventType,
    asaas_payment_id: paymentId,
    event_id: eventId,
  });

  // Localiza cobrança corporativa — se não existir, REJECT (não é nosso domínio)
  let charge: MasterCorporateAsaasCharge | null = null;
  if (payment) {
    charge = await findCharge(supabase, payment);
  }

  if (charge) {
    logCorporateAsaasWebhook('charge found', {
      event: eventType,
      asaas_payment_id: paymentId,
      charge_id: charge.id,
      receivable_id: charge.receivable_id,
      local_status: charge.local_status,
    });
  }

  if (!charge) {
    const ext = payment?.externalReference
      ? parseCorporateAsaasExternalReference(String(payment.externalReference))
      : null;
    if (!ext) {
      await insertWebhookEvent(supabase, {
        event_id: eventId,
        event_type: eventType,
        asaas_payment_id: paymentId,
        charge_id: null,
        receivable_id: null,
        external_reference: payment?.externalReference
          ? String(payment.externalReference)
          : null,
        processing_status: 'REJECTED',
        payload_sanitized: sanitized,
        error_message: 'Evento fora do domínio MASTER_CORPORATE_FINANCE',
        processed_at: nowIso(),
      }).catch(() => ({ id: '', duplicate: true }));
      return {
        ok: true,
        status: 200,
        result: 'REJECTED',
        message: 'Evento ignorado — não é cobrança corporativa.',
      };
    }
  }

  const externalReference =
    charge?.external_reference ||
    (payment?.externalReference ? String(payment.externalReference) : null);

  const inserted = await insertWebhookEvent(supabase, {
    event_id: eventId,
    event_type: eventType,
    asaas_payment_id: paymentId,
    charge_id: charge?.id || null,
    receivable_id: charge?.receivable_id || null,
    external_reference: externalReference,
    processing_status: 'PENDING',
    payload_sanitized: sanitized,
  });

  let eventRowId = inserted.id;
  if (inserted.duplicate) {
    const existing = await loadWebhookEventByEventId(supabase, eventId);
    const priorStatus = existing?.processing_status || '';
    const alreadySettled = Boolean(charge?.receivable_payment_id);
    const canRetry =
      !alreadySettled &&
      (priorStatus === 'FAILED' || priorStatus === 'PENDING' || priorStatus === 'IGNORED');

    if (!canRetry) {
      logCorporateAsaasWebhook('duplicate event ignored', {
        event: eventType,
        asaas_payment_id: paymentId,
        charge_id: charge?.id || null,
        receivable_id: charge?.receivable_id || null,
        prior_status: priorStatus,
      });
      return { ok: true, status: 200, result: 'DUPLICATE' };
    }

    eventRowId = existing?.id || '';
    if (existing?.id) {
      await supabase
        .from('master_corporate_asaas_webhook_events')
        .update({
          processing_status: 'PENDING',
          attempts: (existing.attempts || 1) + 1,
          error_message: null,
          payload_sanitized: sanitized,
        })
        .eq('id', existing.id);
    }
    logCorporateAsaasWebhook('duplicate event retry', {
      event: eventType,
      asaas_payment_id: paymentId,
      charge_id: charge?.id || null,
      receivable_id: charge?.receivable_id || null,
      prior_status: priorStatus,
      stage: 'retry_after_failed_or_pending',
    });
  }

  if (!charge || !payment) {
    await supabase
      .from('master_corporate_asaas_webhook_events')
      .update({
        processing_status: 'IGNORED',
        processed_at: nowIso(),
        error_message: 'Cobrança corporativa não encontrada',
      })
      .eq('event_id', eventId);
    logCorporateAsaasWebhook('charge missing', {
      event: eventType,
      asaas_payment_id: paymentId,
      stage: 'lookup',
    });
    return { ok: true, status: 200, result: 'IGNORED' };
  }

  // Valida domínio da cobrança local
  if (!isCorporateAsaasDomain(charge.domain)) {
    await supabase
      .from('master_corporate_asaas_webhook_events')
      .update({
        processing_status: 'REJECTED',
        processed_at: nowIso(),
        error_message: 'domain inválido',
      })
      .eq('event_id', eventId);
    return { ok: true, status: 200, result: 'REJECTED' };
  }

  try {
    let nextStatus = mapAsaasRemoteStatusToLocal(payment.status);

    // Eventos tipados reforçam status — PAYMENT_CREATED sozinho NÃO liquida
    if (eventType.includes('CONFIRMED')) nextStatus = 'CONFIRMED';
    else if (eventType.includes('RECEIVED')) nextStatus = 'RECEIVED';
    else if (eventType.includes('OVERDUE')) nextStatus = 'OVERDUE';
    else if (eventType.includes('DELETED') || eventType.includes('CANCEL')) {
      nextStatus = 'CANCELLED';
    } else if (eventType.includes('REFUNDED') || eventType.includes('CHARGEBACK')) {
      nextStatus = 'REFUNDED';
    }

    const isCreateOnly = eventType === 'PAYMENT_CREATED';
    const shouldSettle =
      !isCreateOnly &&
      shouldSettleCorporateAsaasPayment({ payment, eventType }) &&
      isCorporateAsaasPaidStatus(nextStatus);

    if (!canDowngradeCorporateAsaasStatus(charge.local_status, nextStatus)) {
      // Já pago localmente + evento pago: tenta liquidar se AR ainda aberta
      if (
        isCorporateAsaasPaidStatus(charge.local_status) &&
        shouldSettle &&
        !charge.receivable_payment_id
      ) {
        nextStatus = charge.local_status;
      } else {
        await supabase
          .from('master_corporate_asaas_webhook_events')
          .update({
            processing_status: 'IGNORED',
            processed_at: nowIso(),
            error_message: `Status protegido: ${charge.local_status} → ${nextStatus}`,
          })
          .eq('event_id', eventId);
        return { ok: true, status: 200, result: 'IGNORED_NO_DOWNGRADE' };
      }
    }

    if (shouldSettle) {
      logCorporateAsaasWebhook('payment evidence accepted', {
        event: eventType,
        asaas_payment_id: paymentId,
        charge_id: charge.id,
        receivable_id: charge.receivable_id,
        asaas_status: payment.status || null,
        payment_date: resolveCorporateAsaasPaymentDate(payment),
      });

      const settled = await settleCorporateAsaasChargeFromRemote(
        supabase,
        charge,
        payment,
        nextStatus,
      );
      await supabase
        .from('master_corporate_asaas_webhook_events')
        .update({
          processing_status: 'PROCESSED',
          processed_at: nowIso(),
          charge_id: settled.charge.id,
          receivable_id: settled.charge.receivable_id,
          error_message: null,
        })
        .eq('event_id', eventId);

      await logCorporateFinanceAudit(supabase, {
        userId: null,
        action: 'CORPORATE_ASAAS_WEBHOOK_SETTLED',
        entityId: settled.charge.id,
        description: `Webhook ${eventType} liquidou ${settled.charge.asaas_payment_id}`,
        newData: {
          event: eventType,
          settled: settled.settled,
          local_status: settled.charge.local_status,
        },
      });

      logCorporateAsaasWebhook(
        settled.settled ? 'receivable settled' : 'duplicate event ignored',
        {
          event: eventType,
          asaas_payment_id: paymentId,
          charge_id: settled.charge.id,
          receivable_id: settled.charge.receivable_id,
          settled: settled.settled,
        },
      );

      return { ok: true, status: 200, result: settled.settled ? 'SETTLED' : 'ALREADY_SETTLED' };
    }

    // PAYMENT_CREATED ou status sem evidência: espelha aguardando — não liquida AR
    if (isCorporateAsaasPaidStatus(nextStatus) && (isCreateOnly || !hasCorporateAsaasPaymentEvidence(payment, eventType))) {
      nextStatus = 'AWAITING_PAYMENT';
    }

    // Atualiza status não-pago (overdue/cancel/awaiting) sem mexer no caixa
    const patch: Record<string, unknown> = {
      local_status: nextStatus,
      asaas_status: payment.status || null,
      last_sync_at: nowIso(),
      updated_at: nowIso(),
    };
    if (nextStatus === 'CANCELLED') patch.canceled_at = charge.canceled_at || nowIso();
    if (nextStatus === 'REFUNDED') patch.refunded_at = charge.refunded_at || nowIso();

    await supabase.from('master_corporate_asaas_charges').update(patch).eq('id', charge.id);
    await supabase
      .from('master_corporate_receivables')
      .update({
        asaas_integration_status: nextStatus,
        asaas_active_charge_id:
          nextStatus === 'CANCELLED' || nextStatus === 'REFUNDED' ? null : charge.id,
        asaas_last_sync_at: nowIso(),
        updated_at: nowIso(),
      })
      .eq('id', charge.receivable_id);

    await supabase
      .from('master_corporate_asaas_webhook_events')
      .update({ processing_status: 'PROCESSED', processed_at: nowIso() })
      .eq('event_id', eventId);

    return { ok: true, status: 200, result: 'UPDATED' };
  } catch (err) {
    const msg = sanitizeCorporateAsaasErrorMessage(err);
    logCorporateAsaasWebhook('settlement failed', {
      event: eventType,
      asaas_payment_id: paymentId,
      charge_id: charge.id,
      receivable_id: charge.receivable_id,
      stage: 'settle_or_update',
      error: msg,
      event_row_id: eventRowId || null,
    });
    await supabase
      .from('master_corporate_asaas_webhook_events')
      .update({
        processing_status: 'FAILED',
        error_message: msg,
      })
      .eq('event_id', eventId);
    await supabase
      .from('master_corporate_receivables')
      .update({
        asaas_last_error: msg,
        asaas_last_sync_at: nowIso(),
        updated_at: nowIso(),
      })
      .eq('id', charge.receivable_id);
    return { ok: false, status: 500, result: 'FAILED', message: msg };
  }
}
