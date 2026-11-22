import { NextResponse } from 'next/server';
import { authorizeTenantBilling } from '@/lib/tenantBillingAuth';
import {
  loadC6SecretsForGrantedOperation,
  redactC6ErrorMessage,
} from '@/lib/banking/c6/c6ConfigRepository';
import {
  executeC6WebhookConsult,
  executeC6WebhookRegister,
  type C6BoletoExecuteResult,
} from '@/lib/banking/c6/c6BoletoClient';
import {
  syncC6BankSlipWebhook,
  type C6WebhookBankCall,
} from '@/lib/banking/c6/c6WebhookRegistration';
import {
  readPrimaryAdminVerifyRequest,
  verifyPrimaryAdminPassword,
} from '@/lib/primaryAdminReauth';
import {
  createPrimaryAdminReauthDeps,
  persistPrimaryAdminVerifyAudit,
} from '@/lib/primaryAdminReauthServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function bankCall(result: C6BoletoExecuteResult): C6WebhookBankCall {
  const status = result.httpStatus;
  if (status === 401 || status === 403) return { httpStatus: status, body: {} };
  if (status == null) {
    const message = String(result.evidence?.message || '');
    if (/autentic|mTLS|401|403|recusad/i.test(message)) return { httpStatus: 401, body: {} };
    return { httpStatus: 503, body: {} };
  }
  return { httpStatus: status, body: result.evidence?.responseBody };
}

/** Consulta ou cadastra o webhook BANK_SLIP da empresa da sessão. Não baixa parcela. */
export async function POST(request: Request) {
  const auth = await authorizeTenantBilling(request);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const record =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const mode = record.action === 'consult' ? 'consult' : record.action === 'register' ? 'register' : '';
  if (!mode) {
    return NextResponse.json({ error: 'Ação de webhook C6 não reconhecida.' }, { status: 422 });
  }
  const authEnvUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (!authEnvUrl || !anonKey) {
    return NextResponse.json({ error: 'Autenticação indisponível.' }, { status: 503 });
  }

  const { password } = readPrimaryAdminVerifyRequest(record);
  const verify = await verifyPrimaryAdminPassword(
    createPrimaryAdminReauthDeps(auth.admin, { url: authEnvUrl, anonKey }),
    { operatorUserId: auth.userId, password, companyId: auth.tenantId },
  );
  await persistPrimaryAdminVerifyAudit(auth.admin, verify);
  if (!verify.ok || verify.tenantId !== auth.tenantId) {
    return NextResponse.json({ error: 'Autorização não concedida.' }, { status: 403 });
  }

  try {
    const secrets = await loadC6SecretsForGrantedOperation(auth.admin, auth.tenantId, 'connection');
    if (!secrets?.integrationId || !secrets.clientId) {
      return NextResponse.json(
        { error: 'Credenciais C6 não encontradas para esta empresa.' },
        { status: 422 },
      );
    }
    const creds = {
      companyId: auth.tenantId,
      integrationId: secrets.integrationId,
      environment: secrets.environment,
      clientId: secrets.clientId,
      clientSecret: secrets.clientSecret,
      certificatePem: secrets.certificatePem,
      privateKeyPem: secrets.privateKeyPem,
    };
    const options = { companyId: auth.tenantId, emissionActivated: true as const };
    const result = await syncC6BankSlipWebhook(auth.admin, {
      companyId: auth.tenantId,
      clientId: secrets.clientId,
      mode,
      consult: async () => bankCall(await executeC6WebhookConsult(creds, options)),
      register: async ({ url }) =>
        bankCall(
          await executeC6WebhookRegister(creds, { url, service: 'BANK_SLIP' }, options),
        ),
    });
    const status =
      result.outcome === 'not-prepared'
        ? 422
        : result.outcome === 'conflict'
          ? 409
          : result.outcome === 'auth-failed'
            ? 502
            : result.outcome === 'temporary'
              ? 503
              : 200;
    if (status !== 200) {
      return NextResponse.json({ error: result.message, webhook: result.webhook }, { status });
    }
    return NextResponse.json({ webhook: result.webhook, message: result.message });
  } catch (error) {
    return NextResponse.json(
      { error: redactC6ErrorMessage(error, 'Não foi possível cadastrar o webhook C6.') },
      { status: 422 },
    );
  }
}
