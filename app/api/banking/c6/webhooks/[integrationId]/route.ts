import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isDevelopHomologRuntime, isProductionSupabaseRuntime } from '@/lib/homolog/env';
import {
  C6_WEBHOOK_FINANCE_MUTATION,
  assertC6WebhookRouteToken,
  c6WebhookReceiverPublicMeta,
  inspectC6WebhookInbound,
} from '@/lib/banking/c6/c6WebhookReceiver';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function integrationIdFrom(params: { integrationId: string }): string {
  return String(params.integrationId || '').trim();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

/**
 * GET /api/banking/c6/webhooks/{integrationId}
 * Saúde pública. Sem token. Não consulta C6. Não altera financeiro.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ integrationId: string }> },
) {
  const integrationId = integrationIdFrom(await params);
  if (!isUuid(integrationId)) {
    return NextResponse.json({ error: 'Integração inválida.', financeMutation: false }, { status: 400 });
  }
  return NextResponse.json(c6WebhookReceiverPublicMeta(integrationId), { status: 200 });
}

/**
 * POST /api/banking/c6/webhooks/{integrationId}?token=…
 * Recebe evento C6 Sandbox. Nunca baixa parcela nem grava financeiro.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ integrationId: string }> },
) {
  if (isProductionSupabaseRuntime() || !isDevelopHomologRuntime()) {
    return NextResponse.json(
      { error: 'Receptor C6 restrito ao Develop/Sandbox.', financeMutation: C6_WEBHOOK_FINANCE_MUTATION },
      { status: 403 },
    );
  }

  const integrationId = integrationIdFrom(await params);
  if (!isUuid(integrationId)) {
    return NextResponse.json({ error: 'Integração inválida.', financeMutation: false }, { status: 400 });
  }

  const token = new URL(request.url).searchParams.get('token') || '';
  if (!assertC6WebhookRouteToken(integrationId, token)) {
    return NextResponse.json(
      { error: 'Origem do webhook não autenticada.', financeMutation: false },
      { status: 401 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: 'Runtime Develop indisponível.', financeMutation: false },
      { status: 503 },
    );
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await admin
    .from('bank_integrations')
    .select('id, company_id, environment, provider, active')
    .eq('id', integrationId)
    .eq('provider', 'C6')
    .maybeSingle();
  if (error) {
    console.error('[c6-webhook] lookup failed');
    return NextResponse.json({ error: 'Falha ao resolver integração.', financeMutation: false }, { status: 500 });
  }
  if (!data?.id || !data.company_id) {
    return NextResponse.json({ error: 'Integração C6 não encontrada.', financeMutation: false }, { status: 404 });
  }
  if (data.active === false) {
    return NextResponse.json(
      { error: 'Integração C6 inativa.', financeMutation: false },
      { status: 403 },
    );
  }
  if (String(data.environment || '').toUpperCase() !== 'SANDBOX') {
    return NextResponse.json(
      { error: 'Receptor C6 aceita somente Sandbox.', financeMutation: false },
      { status: 403 },
    );
  }

  const bodyText = await request.text();
  const inspected = inspectC6WebhookInbound(bodyText);
  console.info(
    `[c6-webhook] received integration=${integrationId} keys=${inspected.keys.join(',') || 'none'} financeMutation=${C6_WEBHOOK_FINANCE_MUTATION}`,
  );

  return NextResponse.json(
    {
      received: true,
      duplicate: false,
      financeMutation: C6_WEBHOOK_FINANCE_MUTATION,
      service: inspected.service,
      sandboxOnly: true,
    },
    { status: 200 },
  );
}
