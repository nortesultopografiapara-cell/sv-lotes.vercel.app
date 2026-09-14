import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import { canViewRevenueSplit } from '@/lib/finance/revenueSplit/permissions';
import { createRevenueSplitService } from '@/lib/finance/revenueSplit/service';
import { createSupabaseRevenueSplitStore } from '@/lib/finance/revenueSplit/supabaseStore';
import { revenueSplitErrorResponse } from '@/lib/finance/revenueSplit/httpAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ saleId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  if (!canViewRevenueSplit(auth.role, { canViewFinance: true })) {
    return NextResponse.json({ present: false, snapshot: null, participants: [], legs: [] });
  }

  try {
    const { saleId } = await context.params;
    if (!saleId) {
      return NextResponse.json({ error: 'saleId obrigatório.' }, { status: 400 });
    }
    const service = createRevenueSplitService(createSupabaseRevenueSplitStore(auth.admin));
    const view = await service.getSaleRevenueSplitView(saleId, auth.tenantId);
    return NextResponse.json({
      present: Boolean(view.snapshot),
      saleId: view.saleId,
      projectId: view.projectId,
      operational: view.operational,
      snapshot: view.snapshot,
      participants: view.participants,
      legs: view.legs,
    });
  } catch (err) {
    return revenueSplitErrorResponse(err);
  }
}
