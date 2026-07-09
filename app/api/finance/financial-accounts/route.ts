import { NextResponse } from 'next/server';
import { authorizeCompanyAsaasRoute } from '@/lib/banking/bankingRouteGuard';
import { isTenantEnterpriseAdminRole } from '@/lib/rolePermissions';
import {
  assertCompanyFinancialAccountResponseSafe,
  type CompanyFinancialAccountType,
} from '@/lib/finance/companyFinancialAccountTypes';
import {
  createCompanyFinancialAccount,
  listCompanyFinancialAccounts,
} from '@/lib/finance/companyFinancialAccountRepository';
import { normalizeAsaasEnvironment } from '@/lib/finance/asaasIntegrationConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorizeCompanyAsaasRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const url = new URL(request.url);
    const includeInactive = url.searchParams.get('includeInactive') === '1';
    const accounts = await listCompanyFinancialAccounts(auth.admin, auth.tenantId, {
      activeOnly: !includeInactive,
    });
    assertCompanyFinancialAccountResponseSafe(accounts);
    return NextResponse.json({ accounts });
  } catch (err) {
    console.error('[finance/financial-accounts GET]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao listar contas financeiras.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await authorizeCompanyAsaasRoute(request);
  if ('error' in auth) return auth.error;

  if (!isTenantEnterpriseAdminRole(auth.role)) {
    return NextResponse.json({ error: 'Permissão negada.' }, { status: 403 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const accountType = String(body.accountType ?? body.account_type ?? 'IMOBILIARIA').toUpperCase();

    const account = await createCompanyFinancialAccount(auth.admin, auth.tenantId, auth.userId, {
      name: String(body.name ?? '').trim(),
      accountType: accountType as CompanyFinancialAccountType,
      beneficiaryName: String(body.beneficiaryName ?? body.beneficiary_name ?? '').trim() || null,
      document: String(body.document ?? '').trim() || null,
      email: String(body.email ?? '').trim() || null,
      phone: String(body.phone ?? '').trim() || null,
      environment: normalizeAsaasEnvironment(body.environment),
      isDefault: Boolean(body.isDefault ?? body.is_default),
      active: body.active !== false,
      notes: String(body.notes ?? '').trim() || null,
      webhookUrl: String(body.webhookUrl ?? body.webhook_url ?? '').trim() || null,
      sandboxApiKey: String(body.sandboxApiKey ?? body.sandbox_api_key ?? '').trim() || null,
      productionApiKey: String(body.productionApiKey ?? body.production_api_key ?? '').trim() || null,
      webhookToken: String(body.webhookToken ?? body.webhook_token ?? '').trim() || null,
    });

    assertCompanyFinancialAccountResponseSafe(account);
    return NextResponse.json({ account });
  } catch (err) {
    console.error('[finance/financial-accounts POST]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao criar conta financeira.' },
      { status: 500 },
    );
  }
}
