import { NextResponse } from 'next/server';
import { authorizeCompanyAsaasRoute } from '@/lib/banking/bankingRouteGuard';
import { rejectAsaasSecretInRequestBody } from '@/lib/finance/asaasWalletId';
import {
  canResolveAsaasWallet,
  resolveAsaasWalletForFinancialAccount,
} from '@/lib/finance/revenueSplit/resolveAsaasWallet';
import { createRevenueSplitService } from '@/lib/finance/revenueSplit/service';
import { createSupabaseRevenueSplitStore } from '@/lib/finance/revenueSplit/supabaseStore';
import { revenueSplitErrorResponse } from '@/lib/finance/revenueSplit/httpAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const auth = await authorizeCompanyAsaasRoute(request);
  if ('error' in auth) return auth.error;

  if (!canResolveAsaasWallet(auth.role)) {
    return NextResponse.json({ error: 'Permissão negada.' }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: 'ID da conta é obrigatório.' }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const rejected = rejectAsaasSecretInRequestBody(body);
  if (rejected) {
    return NextResponse.json({ error: rejected }, { status: 400 });
  }

  try {
    const service = createRevenueSplitService(createSupabaseRevenueSplitStore(auth.admin));
    const result = await resolveAsaasWalletForFinancialAccount({
      admin: auth.admin,
      actor: { role: auth.role, companyId: auth.tenantId, userId: auth.userId },
      companyId: auth.tenantId,
      financialAccountId: id.trim(),
      upsertDestination: (input) => service.upsertAsaasWalletDestination(input),
    });
    return NextResponse.json(result);
  } catch (err) {
    return revenueSplitErrorResponse(err);
  }
}
