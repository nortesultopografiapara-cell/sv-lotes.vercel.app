import { NextResponse } from 'next/server';
import { authorizeTenantBilling } from '@/lib/tenantBillingAuth';
import { isC6EmissionActivated } from '@/lib/banking/c6/c6EmissionAuthorization';
import { isC6BolepixV2CompanyReleased, isC6BolepixV2ReceiptCandidate } from '@/lib/banking/c6/c6BolepixV2OpenApi';
import { C6EmissionNotHomologatedError } from '@/lib/banking/c6/c6EmitGuard';
import {
  consultC6BolepixSituation,
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
  const body = (await request.json().catch(() => ({}))) as { installmentId?: string };
  const installmentId = String(body.installmentId || '').trim();
  if (!installmentId) {
    return NextResponse.json({ error: 'installmentId obrigatório.' }, { status: 400 });
  }
  const homologated =
    isC6BolepixV2ReceiptCandidate(auth.tenantId, installmentId) ||
    (await isC6EmissionActivated(auth.admin, auth.tenantId));
  if (!homologated) return denied();

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
  if (
    !isC6BolepixV2CompanyReleased(auth.tenantId) &&
    !(await isC6EmissionActivated(auth.admin, auth.tenantId))
  ) {
    return denied();
  }
  const url = new URL(request.url);
  const installmentId = url.searchParams.get('installmentId')?.trim() || '';
  if (!installmentId) {
    return NextResponse.json({ error: 'installmentId obrigatório.' }, { status: 400 });
  }
  try {
    if (url.searchParams.get('purpose') === 'situation') {
      const result = await consultC6BolepixSituation(auth.admin, auth.tenantId, installmentId);
      return NextResponse.json(result);
    }
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
