import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import {
  InterResumeBlockedError,
  InterResumeConflictError,
  getInterResumeJobView,
  startAndTickInterResumeJob,
} from '@/lib/banking/inter/interSaleChargesResumeService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;
  try {
    const saleId = new URL(request.url).searchParams.get('saleId')?.trim() || '';
    if (!saleId) return NextResponse.json({ error: 'saleId obrigatório.' }, { status: 400 });
    const job = await getInterResumeJobView(auth.admin, auth.tenantId, saleId);
    return NextResponse.json({ ok: true, job });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao ler job Inter.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      saleId?: string;
      action?: 'start' | 'pause' | 'tick';
      confirmed?: boolean;
    };
    const saleId = String(body.saleId || '').trim();
    const action = body.action === 'pause' || body.action === 'tick' ? body.action : 'start';
    if (!saleId) return NextResponse.json({ error: 'saleId obrigatório.' }, { status: 400 });
    if (action !== 'pause' && body.confirmed !== true) {
      return NextResponse.json({ error: 'Confirmação obrigatória.' }, { status: 400 });
    }
    const result = await startAndTickInterResumeJob({
      admin: auth.admin,
      companyId: auth.tenantId,
      saleId,
      userId: auth.userId,
      action,
    });
    return NextResponse.json({ ok: true, job: result.job });
  } catch (err) {
    if (err instanceof InterResumeConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof InterResumeBlockedError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : 'Erro na retomada Inter.';
    console.error('[finance/inter/sale-charges/resume]', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
