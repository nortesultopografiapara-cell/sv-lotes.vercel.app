import { NextResponse } from 'next/server';
import { authorizeTenantBilling } from '@/lib/tenantBillingAuth';
import { isC6ConfigPersistBlocked } from '@/lib/banking/c6/c6EmitGuard';
import {
  assertC6ConfigResponseSafe,
  getCompanyC6BankConfig,
  redactC6ErrorMessage,
} from '@/lib/banking/c6/c6ConfigRepository';
import { executeC6ConfigPut } from '@/lib/banking/c6/c6ConfigPut';
import { createPrimaryAdminReauthDeps } from '@/lib/primaryAdminReauthServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorizeTenantBilling(request);
  if ('error' in auth) return auth.error;

  try {
    const url = new URL(request.url);
    const financialAccountId =
      url.searchParams.get('financialAccountId') || url.searchParams.get('financial_account_id');
    const config = await getCompanyC6BankConfig(auth.admin, auth.tenantId, {
      financialAccountId,
    });
    assertC6ConfigResponseSafe(config);

    const { data: accounts, error } = await auth.admin
      .from('company_financial_accounts')
      .select('id, name, bank_integration_id')
      .eq('company_id', auth.tenantId)
      .eq('active', true);
    if (error) throw new Error('Não foi possível listar as contas financeiras.');

    const { data: integrations, error: integrationError } = await auth.admin
      .from('bank_integrations')
      .select('id, provider')
      .eq('company_id', auth.tenantId);
    if (integrationError) throw new Error('Não foi possível listar as contas financeiras.');

    const providerById = new Map(
      (integrations || []).map((row) => [String(row.id), String(row.provider || '')]),
    );
    const financialAccounts = (accounts || []).map((row) => {
      const integrationId = row.bank_integration_id ? String(row.bank_integration_id) : '';
      return {
        id: String(row.id),
        name: String(row.name || ''),
        provider: integrationId ? providerById.get(integrationId) || null : null,
      };
    });

    return NextResponse.json({
      config,
      financialAccounts,
      persistBlocked: isC6ConfigPersistBlocked(),
    });
  } catch (error) {
    console.error('[banking/c6/config GET]', redactC6ErrorMessage(error, 'Erro ao carregar configuração C6.'));
    return NextResponse.json(
      { error: redactC6ErrorMessage(error, 'Erro ao carregar configuração C6.') },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const auth = await authorizeTenantBilling(request);
  if ('error' in auth) return auth.error;

  if (isC6ConfigPersistBlocked()) {
    return NextResponse.json(
      { error: 'Cadastro C6 permanece bloqueado em Production.' },
      { status: 403 },
    );
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const authEnvUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (!authEnvUrl || !anonKey) {
    return NextResponse.json({ error: 'Autenticação indisponível.' }, { status: 503 });
  }

  const result = await executeC6ConfigPut({
    admin: auth.admin,
    userId: auth.userId,
    tenantId: auth.tenantId,
    body,
    deps: createPrimaryAdminReauthDeps(auth.admin, { url: authEnvUrl, anonKey }),
    supabaseUrl: authEnvUrl,
  });
  return NextResponse.json(result.body, { status: result.status });
}
