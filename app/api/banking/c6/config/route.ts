import { NextResponse } from 'next/server';
import { authorizeTenantBilling } from '@/lib/tenantBillingAuth';
import { isC6ConfigPersistBlocked } from '@/lib/banking/c6/c6EmitGuard';
import {
  assertC6ConfigResponseSafe,
  getCompanyC6BankConfig,
  saveCompanyC6BankConfig,
} from '@/lib/banking/c6/c6ConfigRepository';
import type { C6BankConfigSaveInput } from '@/lib/banking/c6/c6ConfigTypes';
import { normalizeBankEnvironmentInput } from '@/lib/banking/integrationConfig';
import { readPrimaryAdminVerifyRequest } from '@/lib/primaryAdminReauth';
import { verifyPrimaryAdminPassword } from '@/lib/primaryAdminReauth';
import {
  createPrimaryAdminReauthDeps,
  persistPrimaryAdminVerifyAudit,
} from '@/lib/primaryAdminReauthServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback;
  if (
    /BEGIN |PRIVATE KEY|clientSecret|certificatePem|privateKeyPem|encrypted_payload|access_token/i.test(
      message,
    )
  ) {
    return fallback;
  }
  return message;
}

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
    console.error('[banking/c6/config GET]', safeMessage(error, 'Erro ao carregar configuração C6.'));
    return NextResponse.json(
      { error: safeMessage(error, 'Erro ao carregar configuração C6.') },
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
  const record =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const { password } = readPrimaryAdminVerifyRequest(record);
  const authEnvUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (!authEnvUrl || !anonKey) {
    return NextResponse.json({ error: 'Autenticação indisponível.' }, { status: 503 });
  }

  const deps = createPrimaryAdminReauthDeps(auth.admin, { url: authEnvUrl, anonKey });
  const verify = await verifyPrimaryAdminPassword(deps, {
    operatorUserId: auth.userId,
    password,
    companyId: auth.tenantId,
  });
  await persistPrimaryAdminVerifyAudit(auth.admin, verify);
  if (!verify.ok || verify.tenantId !== auth.tenantId) {
    return NextResponse.json({ error: 'Autorização não concedida.' }, { status: 403 });
  }

  try {
    const input: C6BankConfigSaveInput = {
      environment: normalizeBankEnvironmentInput(record.environment),
      clientId: String(record.clientId ?? record.client_id ?? ''),
      clientSecret: String(record.clientSecret ?? record.client_secret ?? ''),
      certificatePem: String(record.certificatePem ?? record.certificate_pem ?? ''),
      certificateFileName: String(record.certificateFileName ?? record.certificate_file_name ?? ''),
      privateKeyPem: String(record.privateKeyPem ?? record.private_key_pem ?? ''),
      privateKeyFileName: String(record.privateKeyFileName ?? record.private_key_file_name ?? ''),
      financialAccountId:
        String(record.financialAccountId ?? record.financial_account_id ?? '').trim() || null,
      boletoIntent: record.boletoIntent === true,
      bolepixIntent: record.bolepixIntent === true,
    };
    const config = await saveCompanyC6BankConfig(auth.admin, auth.tenantId, input, {
      financialAccountId: input.financialAccountId,
    });
    assertC6ConfigResponseSafe(config);
    return NextResponse.json({ config });
  } catch (error) {
    const message = safeMessage(error, 'Erro ao salvar configuração C6.');
    console.error('[banking/c6/config PUT]', message);
    const status =
      message.includes('não correspondem') ||
      message.includes('inválid') ||
      message.includes('obrigatório') ||
      message.includes('juntos')
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
