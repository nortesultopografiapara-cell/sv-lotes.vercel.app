import { NextResponse } from 'next/server';
import { executeC6BankSlipGet } from '@/lib/banking/c6/c6BoletoClient';
import { loadC6SecretsForGrantedOperation } from '@/lib/banking/c6/c6ConfigRepository';
import { processC6WebhookNotification } from '@/lib/banking/c6/c6WebhookProcessor';
import { consumeC6WebhookAttempt, C6_WEBHOOK_MAX_BODY_BYTES } from '@/lib/banking/c6/c6WebhookNotification';
import { createAdminSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ receiptToken: string }> },
) {
  const { receiptToken } = await params;
  const ip = String(request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim() || 'unknown';
  if (!consumeC6WebhookAttempt(`ip:${ip}`, Date.now())) {
    return NextResponse.json({ accepted: false, error: 'Muitas notificações.' }, { status: 429 });
  }
  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > C6_WEBHOOK_MAX_BODY_BYTES) {
    return NextResponse.json({ accepted: false, error: 'Notificação C6 malformada.' }, { status: 413 });
  }
  const raw = await request.text();
  if (raw.length > C6_WEBHOOK_MAX_BODY_BYTES) {
    return NextResponse.json({ accepted: false, error: 'Notificação C6 malformada.' }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ accepted: false, error: 'Notificação C6 malformada.' }, { status: 400 });
  }

  const { client, configError } = createAdminSupabase();
  if (!client) {
    return NextResponse.json(
      { accepted: false, error: configError || 'Supabase admin não configurado.' },
      { status: 503 },
    );
  }

  const result = await processC6WebhookNotification(client, {
    receiptToken,
    body,
    confirmSlip: async ({ integration, bankSlipId }) => {
      const secrets = await loadC6SecretsForGrantedOperation(client, integration.companyId, 'emission');
      if (!secrets || secrets.integrationId !== integration.id) {
        throw new Error('Credenciais C6 ausentes para esta integração.');
      }
      const queried = await executeC6BankSlipGet(
        {
          companyId: integration.companyId,
          integrationId: integration.id,
          environment: secrets.environment,
          clientId: secrets.clientId,
          clientSecret: secrets.clientSecret,
          certificatePem: secrets.certificatePem,
          privateKeyPem: secrets.privateKeyPem,
        },
        bankSlipId,
        { companyId: integration.companyId, emissionActivated: true },
      );
      return {
        httpStatus: queried.httpStatus || 503,
        body: queried.evidence.responseBody,
      };
    },
  });
  return NextResponse.json(result.body, { status: result.status });
}
