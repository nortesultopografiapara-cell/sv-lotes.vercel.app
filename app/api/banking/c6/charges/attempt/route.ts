import { NextResponse } from 'next/server';
import { authorizeTenantBilling } from '@/lib/tenantBillingAuth';
import { prepareC6BolepixAttempt } from '@/lib/banking/c6/c6BolepixAttempt';
import { C6EmissionNotHomologatedError } from '@/lib/banking/c6/c6EmitGuard';
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

/** Prepara uma referência inédita. Não emite boleto. */
export async function POST(request: Request) {
  const auth = await authorizeTenantBilling(request);
  if ('error' in auth) return auth.error;
  const body = await request.json().catch(() => null);
  const record = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const installmentId = String(record.installmentId || '').trim();
  if (!installmentId) {
    return NextResponse.json({ error: 'installmentId obrigatório.' }, { status: 400 });
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
  if (!verify.ok || !verify.authorizedByUserId || verify.tenantId !== auth.tenantId) {
    return NextResponse.json({ error: 'Autorização não concedida.' }, { status: 403 });
  }
  try {
    const result = await prepareC6BolepixAttempt(auth.admin, auth.tenantId, installmentId, verify.authorizedByUserId);
    return NextResponse.json(result, { status: result.prepared ? 200 : 422 });
  } catch (error) {
    if (error instanceof C6EmissionNotHomologatedError) {
      return NextResponse.json({ error: 'Emissão C6 ainda não autorizada para esta empresa.' }, { status: 403 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Falha ao preparar a nova tentativa.' },
      { status: 422 },
    );
  }
}
