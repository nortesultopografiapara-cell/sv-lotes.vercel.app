import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import { processSaasChargePaid } from '@/lib/saasCharges';
import { mapProviderStatusToChargeStatus } from '@/lib/payments/providers';

export const runtime = 'nodejs';

type AsaasWebhookEvent = {
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

function verifyWebhookToken(request: Request): boolean {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN?.trim();
  if (!expected) return true;
  const header =
    request.headers.get('asaas-access-token') ||
    request.headers.get('x-webhook-token') ||
    request.headers.get('authorization');
  if (!header) return false;
  return header.replace(/^Bearer\s+/i, '') === expected;
}

export async function POST(request: Request) {
  if (!verifyWebhookToken(request)) {
    return NextResponse.json({ error: 'Webhook não autorizado.' }, { status: 401 });
  }

  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  let payload: AsaasWebhookEvent;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }

  const event = String(payload.event || '').toUpperCase();
  const payment = payload.payment;
  if (!payment?.id) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const mapped = mapProviderStatusToChargeStatus(payment.status || '');
  const isPaidEvent = PAID_EVENTS.has(event) || mapped === 'PAID';

  if (!isPaidEvent) {
    return NextResponse.json({ ok: true, ignored: true, event });
  }

  try {
    const paidAt =
      payment.paymentDate || payment.clientPaymentDate || new Date().toISOString().split('T')[0];

    const result = await processSaasChargePaid(supabaseAdmin, {
      paymentId: payment.id,
      chargeId: payment.externalReference || undefined,
      paidAt,
      source: 'webhook:asaas',
    });

    return NextResponse.json({
      ok: true,
      chargeId: result.charge.id,
      masterPaymentId: result.paymentId,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro ao processar webhook';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, service: 'saas-payments-webhook' });
}
