import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import {
  deleteInterCobrancaWebhook,
  getInterCobrancaWebhook,
  putInterCobrancaWebhook,
} from '@/lib/banking/inter/interCobrancaClient';
import {
  assertInterConfigResponseSafe,
  getCompanyInterBankConfig,
  loadInterSecretsForServer,
  type InterConfigLookup,
} from '@/lib/banking/inter/interConfigRepository';
import type { InterOAuthCredentials } from '@/lib/banking/inter/interOAuthClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function receiverPublicUrl(companyId: string): string | null {
  const base = String(process.env.INTER_WEBHOOK_RECEIVER_PUBLIC_URL || '').trim().replace(/\/$/, '');
  if (!base) return null;
  return `${base}/webhook/${companyId}`;
}

function lookupFromRequest(request: Request, body?: Record<string, unknown>): InterConfigLookup {
  const url = new URL(request.url);
  return {
    financialAccountId:
      String(
        body?.financialAccountId ??
          body?.financial_account_id ??
          url.searchParams.get('financialAccountId') ??
          url.searchParams.get('financial_account_id') ??
          '',
      ).trim() || null,
    integrationId:
      String(
        body?.integrationId ??
          body?.integration_id ??
          url.searchParams.get('integrationId') ??
          url.searchParams.get('integration_id') ??
          '',
      ).trim() || null,
  };
}

async function loadCreds(
  admin: Parameters<typeof loadInterSecretsForServer>[0],
  companyId: string,
  lookup?: InterConfigLookup,
): Promise<InterOAuthCredentials> {
  const secrets = await loadInterSecretsForServer(admin, companyId, lookup);
  if (!secrets) throw new Error('Configure as credenciais Inter antes do webhook.');
  return {
    companyId,
    integrationId: secrets.integrationId,
    environment: secrets.environment,
    clientId: secrets.clientId,
    clientSecret: secrets.clientSecret,
    certificatePem: secrets.certificatePem,
    privateKeyPem: secrets.privateKeyPem,
  };
}

async function readWebhookMeta(
  admin: Parameters<typeof getCompanyInterBankConfig>[0],
  companyId: string,
  lookup?: InterConfigLookup,
): Promise<Record<string, unknown>> {
  const config = await getCompanyInterBankConfig(admin, companyId, lookup);
  if (!config.id) return {};
  const { data } = await admin
    .from('bank_integrations')
    .select('metadata')
    .eq('id', config.id)
    .eq('company_id', companyId)
    .eq('provider', 'INTER')
    .maybeSingle();
  const meta =
    data?.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {};
  return (meta.webhook as Record<string, unknown>) || {};
}

async function writeWebhookMeta(
  admin: Parameters<typeof getCompanyInterBankConfig>[0],
  companyId: string,
  patch: Record<string, unknown>,
  lookup?: InterConfigLookup,
): Promise<void> {
  const config = await getCompanyInterBankConfig(admin, companyId, lookup);
  if (!config.id) return;
  const { data } = await admin
    .from('bank_integrations')
    .select('id, metadata')
    .eq('id', config.id)
    .eq('company_id', companyId)
    .eq('provider', 'INTER')
    .maybeSingle();
  if (!data?.id) return;
  const prev =
    data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {};
  const webhook = { ...((prev.webhook as Record<string, unknown>) || {}), ...patch };
  await admin
    .from('bank_integrations')
    .update({
      metadata: { ...prev, webhook },
      updated_at: new Date().toISOString(),
    })
    .eq('id', data.id)
    .eq('company_id', companyId)
    .eq('provider', 'INTER');
}

export async function GET(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const lookup = lookupFromRequest(request);
    const config = await getCompanyInterBankConfig(auth.admin, auth.tenantId, lookup);
    assertInterConfigResponseSafe(config);
    const receiverUrl = receiverPublicUrl(auth.tenantId);
    const localMeta = await readWebhookMeta(auth.admin, auth.tenantId, lookup);

    let remote: { webhookUrl: string; criacao?: string | null } | null = null;
    let remoteError: string | null = null;
    try {
      const creds = await loadCreds(auth.admin, auth.tenantId, lookup);
      remote = await getInterCobrancaWebhook(creds);
    } catch (err) {
      remoteError = err instanceof Error ? err.message : 'Falha ao consultar webhook remoto.';
    }

    return NextResponse.json({
      config,
      webhook: {
        receiverPublicUrl: receiverUrl,
        registeredUrl: remote?.webhookUrl || null,
        registeredAt: remote?.criacao || null,
        status: remote?.webhookUrl
          ? 'REGISTERED'
          : receiverUrl
            ? 'NOT_REGISTERED'
            : 'RECEIVER_URL_MISSING',
        lastNotificationAt: localMeta.lastNotificationAt || null,
        lastNotificationCodigo: localMeta.lastNotificationCodigo || null,
        lastNotificationSituacao: localMeta.lastNotificationSituacao || null,
        lastError: localMeta.lastError || remoteError,
        remoteError,
      },
    });
  } catch (err) {
    console.error('[banking/inter/webhook GET]', err instanceof Error ? err.message : 'error');
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao consultar webhook.' },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const lookup = lookupFromRequest(request, body);
    const receiverUrl = receiverPublicUrl(auth.tenantId);
    if (!receiverUrl) {
      return NextResponse.json(
        {
          error:
            'INTER_WEBHOOK_RECEIVER_PUBLIC_URL não configurada no ambiente do SV LOTES.',
        },
        { status: 503 },
      );
    }
    const creds = await loadCreds(auth.admin, auth.tenantId, lookup);
    const remote = await putInterCobrancaWebhook(creds, receiverUrl);
    await writeWebhookMeta(auth.admin, auth.tenantId, {
      registeredUrl: remote.webhookUrl,
      registeredAt: remote.criacao || new Date().toISOString(),
      lastError: null,
      status: 'REGISTERED',
    }, lookup);
    return NextResponse.json({
      ok: true,
      webhook: {
        receiverPublicUrl: receiverUrl,
        registeredUrl: remote.webhookUrl,
        registeredAt: remote.criacao || null,
        status: 'REGISTERED',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao cadastrar webhook.';
    console.error('[banking/inter/webhook PUT]', message);
    await writeWebhookMeta(
      auth.admin,
      auth.tenantId,
      { lastError: message.slice(0, 300) },
      lookupFromRequest(request),
    );
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const lookup = lookupFromRequest(request, body);
    const creds = await loadCreds(auth.admin, auth.tenantId, lookup);
    await deleteInterCobrancaWebhook(creds);
    await writeWebhookMeta(auth.admin, auth.tenantId, {
      registeredUrl: null,
      status: 'NOT_REGISTERED',
      lastError: null,
    }, lookup);
    return NextResponse.json({ ok: true, status: 'NOT_REGISTERED' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao remover webhook.';
    console.error('[banking/inter/webhook DELETE]', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
