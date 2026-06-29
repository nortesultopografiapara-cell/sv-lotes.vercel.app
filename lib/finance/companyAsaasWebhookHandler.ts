import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isBankingModuleEnabled } from '@/lib/banking/config';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import { decryptBankingSecret } from '@/lib/banking/credentialsCrypto';
import { getCompanyAsaasIntegrationConfig } from '@/lib/finance/asaasIntegrationRepository';
import {
  executeCompanyAsaasPaymentReconciliation,
  isCompanyAsaasPaidWebhookEvent,
  resolveCompanyAsaasReconcileDates,
  type CompanyAsaasPaymentWebhookPayment,
} from './companyAsaasPaymentReconciliation';
import {
  getCompanyAsaasChargeByPaymentId,
  markCompanyAsaasWebhookEventProcessed,
  registerCompanyAsaasWebhookEvent,
  updateCompanyAsaasCharge,
} from './companyAsaasChargeRepository';
import { mapAsaasPaymentStatusToCompanyCharge } from './companyAsaasChargeTypes';
import {
  COMPANY_ASAAS_ACCESS_DENIED_MESSAGE,
  isCompanyAsaasEnabled,
} from './companyAsaasAccess';

export type CompanyAsaasWebhookPayload = {
  event?: string;
  id?: string;
  payment?: CompanyAsaasPaymentWebhookPayment;
};

const CANCELLED_EVENTS = new Set(['PAYMENT_DELETED', 'PAYMENT_REFUNDED']);

export async function loadCompanyAsaasWebhookToken(
  admin: SupabaseClient,
  companyId: string,
): Promise<string | null> {
  const config = await getCompanyAsaasIntegrationConfig(admin, companyId);
  if (!config.id) return null;

  const { data } = await admin
    .from('bank_credentials')
    .select('encrypted_payload')
    .eq('integration_id', config.id)
    .eq('credential_type', 'webhook_secret')
    .maybeSingle();

  if (!data?.encrypted_payload) return null;
  try {
    return decryptBankingSecret(String(data.encrypted_payload));
  } catch {
    return null;
  }
}

export function verifyCompanyAsaasWebhookToken(
  request: Request,
  expectedToken: string | null,
): boolean {
  if (!expectedToken) return true;
  const header =
    request.headers.get('asaas-access-token') ||
    request.headers.get('x-webhook-token') ||
    request.headers.get('authorization');
  if (!header) return false;
  return header.replace(/^Bearer\s+/i, '') === expectedToken;
}

function resolveCompanyIdFromRequest(request: Request): string | null {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get('companyId') || url.searchParams.get('company_id');
  return fromQuery ? String(fromQuery).trim() : null;
}

function buildEventId(payload: CompanyAsaasWebhookPayload): string {
  const paymentId = payload.payment?.id || 'unknown';
  const event = payload.event || 'UNKNOWN';
  const id = payload.id || `${event}:${paymentId}`;
  return String(id);
}

export async function handleCompanyAsaasPaymentWebhook(request: Request): Promise<Response> {
  if (!isBankingModuleEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const companyId = resolveCompanyIdFromRequest(request);
  if (!companyId) {
    return NextResponse.json({ error: 'companyId obrigatório na query string.' }, { status: 400 });
  }

  if (!isCompanyAsaasEnabled(companyId)) {
    return NextResponse.json({ error: COMPANY_ASAAS_ACCESS_DENIED_MESSAGE }, { status: 403 });
  }

  const { client: admin, error: adminError } = createServiceSupabase();
  if (!admin) {
    return NextResponse.json({ error: adminError || 'Serviço indisponível.' }, { status: 503 });
  }

  const expectedToken = await loadCompanyAsaasWebhookToken(admin, companyId);
  if (!verifyCompanyAsaasWebhookToken(request, expectedToken)) {
    return NextResponse.json({ error: 'Webhook não autorizado.' }, { status: 401 });
  }

  let payload: CompanyAsaasWebhookPayload;
  try {
    payload = (await request.json()) as CompanyAsaasWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }

  const eventType = String(payload.event || 'UNKNOWN');
  const paymentId = String(payload.payment?.id || '').trim();
  const eventId = buildEventId(payload);

  const registration = await registerCompanyAsaasWebhookEvent(admin, {
    companyId,
    eventId,
    eventType,
    asaasPaymentId: paymentId || null,
    rawPayload: payload as Record<string, unknown>,
  });

  if (registration.duplicate && ['PROCESSED', 'DUPLICATE'].includes(registration.processingStatus)) {
    return NextResponse.json({ ok: true, duplicate: true, reason: 'already_processed' });
  }

  if (!paymentId) {
    if (registration.id) {
      await markCompanyAsaasWebhookEventProcessed(admin, registration.id, companyId, 'IGNORED');
    }
    return NextResponse.json({ ok: true, ignored: true, reason: 'missing_payment_id' });
  }

  const charge = await getCompanyAsaasChargeByPaymentId(admin, companyId, paymentId);
  if (!charge) {
    if (registration.id) {
      await markCompanyAsaasWebhookEventProcessed(admin, registration.id, companyId, 'IGNORED', 'charge_not_found');
    }
    return NextResponse.json({ ok: true, ignored: true, reason: 'charge_not_found' });
  }

  if (registration.id) {
    await admin
      .from('company_asaas_webhook_events')
      .update({
        installment_id: charge.installmentId,
        charge_id: charge.id,
      })
      .eq('id', registration.id)
      .eq('company_id', companyId);
  }

  if (CANCELLED_EVENTS.has(eventType)) {
    await updateCompanyAsaasCharge(admin, charge.id, companyId, {
      status: 'CANCELLED',
      rawPayload: mergeCancelledPayload(payload.payment),
    });
    if (registration.id) {
      await markCompanyAsaasWebhookEventProcessed(admin, registration.id, companyId, 'PROCESSED');
    }
    return NextResponse.json({ ok: true, status: 'cancelled' });
  }

  const mappedStatus = mapAsaasPaymentStatusToCompanyCharge(payload.payment?.status);
  const isPaidEvent = isCompanyAsaasPaidWebhookEvent(eventType);
  if (!isPaidEvent && mappedStatus !== 'PAID') {
    if (registration.id) {
      await markCompanyAsaasWebhookEventProcessed(admin, registration.id, companyId, 'IGNORED', eventType);
    }
    return NextResponse.json({ ok: true, ignored: true, reason: eventType });
  }

  const { paidAt, paymentDate, creditedDate } = resolveCompanyAsaasReconcileDates(payload.payment);

  try {
    const result = await executeCompanyAsaasPaymentReconciliation(admin, {
      companyId,
      asaasPaymentId: paymentId,
      eventType,
      paidAt,
      paymentDate,
      creditedDate,
      paymentPayload: payload.payment ?? null,
    });

    if (!result.ok) {
      if (registration.id) {
        await markCompanyAsaasWebhookEventProcessed(
          admin,
          registration.id,
          companyId,
          'IGNORED',
          'charge_not_found_on_reconcile',
        );
      }
      return NextResponse.json({ ok: true, ignored: true, reason: 'charge_not_found' });
    }

    if (registration.id) {
      await markCompanyAsaasWebhookEventProcessed(
        admin,
        registration.id,
        companyId,
        result.duplicate ? 'DUPLICATE' : 'PROCESSED',
      );
    }

    return NextResponse.json({
      ok: true,
      duplicate: result.duplicate,
      chargeId: result.chargeId,
      cashMovementId: result.cashMovementId,
      installmentId: result.installmentId,
      receiptUpdated: result.receiptUpdated,
      cashMovementError: result.cashMovementError,
    });
  } catch (err) {
    console.error('[company-asaas-webhook] reconcile failed', err);
    if (registration.id) {
      await markCompanyAsaasWebhookEventProcessed(
        admin,
        registration.id,
        companyId,
        'FAILED',
        err instanceof Error ? err.message : 'reconcile_failed',
      );
    }
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Falha ao reconciliar pagamento.' },
      { status: 500 },
    );
  }
}

function mergeCancelledPayload(
  payment?: CompanyAsaasPaymentWebhookPayment | null,
): Record<string, unknown> {
  return {
    ...(payment && typeof payment === 'object' ? (payment as Record<string, unknown>) : {}),
    cancelled_at: new Date().toISOString(),
  };
}
