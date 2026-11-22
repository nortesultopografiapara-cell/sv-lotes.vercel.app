import { NextResponse } from 'next/server';
import { authorizeTenantBilling } from '@/lib/tenantBillingAuth';
import { isC6CompanyOperationEnabled } from '@/lib/banking/c6/c6CompanyAccess';
import { C6EmissionNotHomologatedError } from '@/lib/banking/c6/c6EmitGuard';
import {
  emitC6InstallmentBoleto,
  queryC6InstallmentBoleto,
} from '@/lib/banking/c6/c6InstallmentCharge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function denied() {
  return NextResponse.json(
    { error: 'Emissão C6 ainda não autorizada para esta empresa.' },
    { status: 403 },
  );
}

export async function POST(request: Request) {
  const auth = await authorizeTenantBilling(request);
  if ('error' in auth) return auth.error;
  if (!isC6CompanyOperationEnabled(auth.tenantId, 'emission')) return denied();

  const body = (await request.json().catch(() => ({}))) as { installmentId?: string };
  const installmentId = String(body.installmentId || '').trim();
  if (!installmentId) {
    return NextResponse.json({ error: 'installmentId obrigatório.' }, { status: 400 });
  }
  try {
    const result = await emitC6InstallmentBoleto(auth.admin, auth.tenantId, installmentId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof C6EmissionNotHomologatedError) return denied();
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Falha ao emitir o boleto C6.' },
      { status: 422 },
    );
  }
}

export async function GET(request: Request) {
  const auth = await authorizeTenantBilling(request);
  if ('error' in auth) return auth.error;
  if (!isC6CompanyOperationEnabled(auth.tenantId, 'emission')) return denied();
  const installmentId = new URL(request.url).searchParams.get('installmentId')?.trim() || '';
  if (!installmentId) {
    return NextResponse.json({ error: 'installmentId obrigatório.' }, { status: 400 });
  }
  try {
    const result = await queryC6InstallmentBoleto(auth.admin, auth.tenantId, installmentId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof C6EmissionNotHomologatedError) return denied();
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Falha ao consultar o boleto C6.' },
      { status: 422 },
    );
  }
}
