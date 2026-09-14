import { NextResponse } from 'next/server';
import { authorizeCompanyAsaasRoute } from '@/lib/banking/bankingRouteGuard';
import { getBankingEncryptionKeyDiagnostics } from '@/lib/banking/credentialsCrypto';
import {
  assertAsaasIntegrationResponseSafe,
  getCompanyAsaasIntegrationOverview,
  patchAsaasIntegrationMetadata,
  saveCompanyAsaasIntegrationConfig,
} from '@/lib/finance/asaasIntegrationRepository';
import type { AsaasIntegrationConfigInput } from '@/lib/finance/asaasIntegrationConfig';
import { normalizeAsaasEnvironment } from '@/lib/finance/asaasIntegrationConfig';
import { isCompanyAsaasIntegrationReady } from '@/lib/finance/companyAsaasChargeTypes';
import {
  isFinancialAccountRequiredError,
  parseFinancialAccountIdFromRecord,
  parseFinancialAccountIdFromRequestUrl,
} from '@/lib/finance/financialAccountRequired';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorizeCompanyAsaasRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const financialAccountId = parseFinancialAccountIdFromRequestUrl(request);
    const overview = await getCompanyAsaasIntegrationOverview(auth.admin, auth.tenantId, {
      financialAccountId,
    });

    let integration = overview.integration;
    if (
      integration?.id &&
      overview.selectedFinancialAccountId &&
      integration.status !== 'ACTIVE' &&
      isCompanyAsaasIntegrationReady(integration)
    ) {
      await patchAsaasIntegrationMetadata(
        auth.admin,
        auth.tenantId,
        {
          status: 'ACTIVE',
          connectionStatus: 'CONNECTED',
        },
        { financialAccountId: overview.selectedFinancialAccountId },
      );
      const refreshed = await getCompanyAsaasIntegrationOverview(auth.admin, auth.tenantId, {
        financialAccountId: overview.selectedFinancialAccountId,
      });
      integration = refreshed.integration;
      overview.integration = refreshed.integration;
      overview.ready = refreshed.ready;
      overview.canOperate = refreshed.canOperate;
    }

    if (integration) {
      assertAsaasIntegrationResponseSafe(integration);
    }

    return NextResponse.json({
      integration,
      ready: overview.ready,
      canOperate: overview.canOperate,
      accounts: overview.accounts,
      selectedFinancialAccountId: overview.selectedFinancialAccountId,
      multiAccount: overview.multiAccount,
    });
  } catch (err) {
    console.error('[finance/asaas/integration GET]', err);
    const message = err instanceof Error ? err.message : 'Erro ao carregar integração Asaas.';
    return NextResponse.json(
      { error: message },
      { status: isFinancialAccountRequiredError(err) ? 400 : 500 },
    );
  }
}

export async function PUT(request: Request) {
  const auth = await authorizeCompanyAsaasRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const features: AsaasIntegrationConfigInput['features'] = {};
    if (body.pix !== undefined) features.pix = Boolean(body.pix);
    if (body.boleto !== undefined) features.boleto = Boolean(body.boleto);
    if (body.card !== undefined) features.card = Boolean(body.card);
    if (body.paymentLink !== undefined) features.paymentLink = Boolean(body.paymentLink);
    if (body.autoSync !== undefined) features.autoSync = Boolean(body.autoSync);

    const input: AsaasIntegrationConfigInput = {
      environment: normalizeAsaasEnvironment(body.environment),
      sandboxApiKey: String(body.sandboxApiKey ?? body.sandbox_api_key ?? ''),
      productionApiKey: String(body.productionApiKey ?? body.production_api_key ?? ''),
      webhookToken: String(body.webhookToken ?? body.webhook_token ?? ''),
      webhookUrl: String(body.webhookUrl ?? body.webhook_url ?? ''),
      autoSync: body.autoSync !== undefined ? Boolean(body.autoSync) : undefined,
      features: Object.keys(features).length > 0 ? features : undefined,
    };

    const financialAccountId = parseFinancialAccountIdFromRecord(body);
    const integration = await saveCompanyAsaasIntegrationConfig(
      auth.admin,
      auth.tenantId,
      auth.userId,
      input,
      { financialAccountId },
    );
    assertAsaasIntegrationResponseSafe(integration);
    return NextResponse.json({ integration, financialAccountId: integration.financialAccountId ?? financialAccountId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao salvar integração Asaas.';
    if (message.includes('BANKING_CREDENTIALS_ENCRYPTION_KEY')) {
      console.warn('[finance/asaas/integration PUT] encryption diagnostics', getBankingEncryptionKeyDiagnostics());
    }
    console.error('[finance/asaas/integration PUT]', err);
    return NextResponse.json(
      { error: message },
      { status: isFinancialAccountRequiredError(err) ? 400 : 500 },
    );
  }
}
