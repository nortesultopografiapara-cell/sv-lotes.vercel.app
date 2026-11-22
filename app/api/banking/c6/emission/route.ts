import { NextResponse } from 'next/server';
import { authorizeTenantBilling } from '@/lib/tenantBillingAuth';
import { setC6CompanyEmissionEnabled } from '@/lib/banking/c6/c6EmissionAuthorization';
import {
  assertC6ConfigResponseSafe,
  getCompanyC6BankConfig,
  redactC6ErrorMessage,
} from '@/lib/banking/c6/c6ConfigRepository';
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

/** Liga ou desliga a emissão da empresa da sessão. Não emite boleto. */
export async function POST(request: Request) {
  const auth = await authorizeTenantBilling(request);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const record =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const enabled = record.enabled === true;
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
    await setC6CompanyEmissionEnabled(auth.admin, auth.tenantId, enabled);
    const config = await getCompanyC6BankConfig(auth.admin, auth.tenantId);
    assertC6ConfigResponseSafe(config);
    return NextResponse.json({ config, emissionEnabled: config.emissionEnabled === true });
  } catch (error) {
    const message = redactC6ErrorMessage(error, 'Não foi possível atualizar a emissão C6.');
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
