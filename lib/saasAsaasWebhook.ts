import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  processSaasChargeCancelled,
  processSaasChargeOverdue,
  processSaasChargePaid,
} from '@/lib/saasCharges';
import { mapProviderStatusToChargeStatus } from '@/lib/payments/providers';

export type AsaasWebhookEvent = {
  event?: string;
  payment?: {
    id?: string;
    status?: string;
    paymentDate?: string;
    clientPaymentDate?: string;
    externalReference?: string;
  };
};

const PAID_EVENTS = new Set([
  'PAYMENT_RECEIVED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_RECEIVED_IN_CASH',
]);

const OVERDUE_EVENTS = new Set(['PAYMENT_OVERDUE']);

const CANCELLED_EVENTS = new Set(['PAYMENT_DELETED', 'PAYMENT_REFUNDED']);

const INFORMATIVE_EVENTS = new Set([
  'PAYMENT_CREATED',
  'PAYMENT_UPDATED',
  'PAYMENT_RESTORED',
]);

export type AsaasWebhookDeps = {
  createSupabase: () => { client: SupabaseClient | null; error?: string };
  processPaid: typeof processSaasChargePaid;
  processOverdue: typeof processSaasChargeOverdue;
  processCancelled: typeof processSaasChargeCancelled;
};

const defaultDeps: AsaasWebhookDeps = {
  createSupabase: createServiceSupabase,
  processPaid: processSaasChargePaid,
  processOverdue: processSaasChargeOverdue,
  processCancelled: processSaasChargeCancelled,
};

export function verifyAsaasWebhookToken(request: Request): boolean {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN?.trim();
  if (!expected) return true;
  const header =
    request.headers.get('asaas-access-token') ||
    request.headers.get('x-webhook-token') ||
    request.headers.get('authorization');
  if (!header) return false;
  return header.replace(/^Bearer\s+/i, '') === expected;
}

function ignoredResponse(reason: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: true, ignored: true, reason, ...extra });
}

function okResponse(extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: true, ...extra });
}

export async function handleAsaasPaymentWebhook(
  request: Request,
  deps: AsaasWebhookDeps = defaultDeps,
) {
  if (!verifyAsaasWebhookToken(request)) {
    return NextResponse.json({ error: 'Webhook não autorizado.' }, { status: 401 });
  }

  let payload: AsaasWebhookEvent;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }

  const { client: supabaseAdmin, error: configError } = deps.createSupabase();
  if (!supabaseAdmin) {
    console.error('[asaas-webhook] Supabase indisponível:', configError);
    return ignoredResponse('Serviço indisponível — Supabase não configurado.');
  }

  const event = String(payload.event || '').toUpperCase();
  const payment = payload.payment;

  if (!payment?.id) {
    return ignoredResponse('payment.id ausente.');
  }

  if (INFORMATIVE_EVENTS.has(event)) {
    return okResponse({ informative: true, event });
  }

  const mapped = mapProviderStatusToChargeStatus(payment.status || '');
  const paymentRef = {
    paymentId: payment.id,
    chargeId: payment.externalReference || undefined,
    source: `webhook:asaas:${event || 'unknown'}`,
  };

  try {
    if (PAID_EVENTS.has(event) || mapped === 'PAID') {
      const paidAt =
        payment.paymentDate || payment.clientPaymentDate || new Date().toISOString().split('T')[0];

      const result = await deps.processPaid(supabaseAdmin, {
        ...paymentRef,
        paidAt,
      });

      return okResponse({
        chargeId: result.charge.id,
        masterPaymentId: result.paymentId,
        event,
      });
    }

    if (OVERDUE_EVENTS.has(event) || mapped === 'OVERDUE') {
      const result = await deps.processOverdue(supabaseAdmin, paymentRef);
      return okResponse({ chargeId: result.charge.id, event, status: 'OVERDUE' });
    }

    if (CANCELLED_EVENTS.has(event) || mapped === 'CANCELLED') {
      const result = await deps.processCancelled(supabaseAdmin, paymentRef);
      return okResponse({ chargeId: result.charge.id, event, status: 'CANCELLED' });
    }

    return ignoredResponse('Evento não tratado.', { event: event || null });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro ao processar webhook';
    console.error('[asaas-webhook] Falha ao processar pagamento:', {
      event,
      paymentId: payment.id,
      externalReference: payment.externalReference ?? null,
      error: message,
    });
    return ignoredResponse(message);
  }
}
