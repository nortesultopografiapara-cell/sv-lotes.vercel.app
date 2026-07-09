import { NextResponse } from 'next/server';
import { authorizeCompanyAsaasRoute } from '@/lib/banking/bankingRouteGuard';
import { isTenantEnterpriseAdminRole } from '@/lib/rolePermissions';
import {
  assertCompanyFinancialAccountResponseSafe,
  type CompanyFinancialAccountType,
} from '@/lib/finance/companyFinancialAccountTypes';
import { updateCompanyFinancialAccount } from '@/lib/finance/companyFinancialAccountRepository';
import { normalizeAsaasEnvironment } from '@/lib/finance/asaasIntegrationConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await authorizeCompanyAsaasRoute(request);
  if ('error' in auth) return auth.error;

  if (!isTenantEnterpriseAdminRole(auth.role)) {
    return NextResponse.json({ error: 'Permissão negada.' }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: 'ID da conta é obrigatório.' }, { status: 400 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Parameters<typeof updateCompanyFinancialAccount>[4] = {};

    if (body.name !== undefined) patch.name = String(body.name);
    if (body.accountType !== undefined || body.account_type !== undefined) {
      patch.accountType = String(body.accountType ?? body.account_type).toUpperCase() as CompanyFinancialAccountType;
    }
    if (body.beneficiaryName !== undefined || body.beneficiary_name !== undefined) {
      patch.beneficiaryName = String(body.beneficiaryName ?? body.beneficiary_name ?? '');
    }
    if (body.document !== undefined) patch.document = String(body.document ?? '');
    if (body.email !== undefined) patch.email = String(body.email ?? '');
    if (body.phone !== undefined) patch.phone = String(body.phone ?? '');
    if (body.environment !== undefined) patch.environment = normalizeAsaasEnvironment(body.environment);
    if (body.isDefault !== undefined || body.is_default !== undefined) {
      patch.isDefault = Boolean(body.isDefault ?? body.is_default);
    }
    if (body.active !== undefined) patch.active = Boolean(body.active);
    if (body.notes !== undefined) patch.notes = String(body.notes ?? '');
    if (body.webhookUrl !== undefined || body.webhook_url !== undefined) {
      patch.webhookUrl = String(body.webhookUrl ?? body.webhook_url ?? '');
    }
    if (body.sandboxApiKey !== undefined || body.sandbox_api_key !== undefined) {
      patch.sandboxApiKey = String(body.sandboxApiKey ?? body.sandbox_api_key ?? '');
    }
    if (body.productionApiKey !== undefined || body.production_api_key !== undefined) {
      patch.productionApiKey = String(body.productionApiKey ?? body.production_api_key ?? '');
    }
    if (body.webhookToken !== undefined || body.webhook_token !== undefined) {
      patch.webhookToken = String(body.webhookToken ?? body.webhook_token ?? '');
    }

    const account = await updateCompanyFinancialAccount(
      auth.admin,
      auth.tenantId,
      id,
      auth.userId,
      patch,
    );
    assertCompanyFinancialAccountResponseSafe(account);
    return NextResponse.json({ account });
  } catch (err) {
    console.error('[finance/financial-accounts PATCH]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao atualizar conta financeira.' },
      { status: 500 },
    );
  }
}
