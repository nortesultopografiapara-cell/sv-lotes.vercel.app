import { NextResponse } from 'next/server';
import {
  authorizeCorporateFinance,
  getCorporateFinanceServiceClient,
} from '@/lib/master/corporateFinance/apiAuth';
import { httpStatusFromMessage } from '@/lib/master/corporateFinance/arApApi';
import { backfillCashMovements } from '@/lib/master/corporateFinance/cashMovementsService';

export async function POST(request: Request) {
  const { client: supabaseAdmin, error: configError } = getCorporateFinanceServiceClient();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  try {
    const body = await request.json();
    const auth = await authorizeCorporateFinance(supabaseAdmin, {
      userId: body.userId,
      impersonatingTenantId: body.impersonatingTenantId,
    });
    if (!auth.ok) return auth.response;

    if (typeof body.dryRun !== 'boolean') {
      throw new Error('dryRun é obrigatório (true|false).');
    }

    const report = await backfillCashMovements(supabaseAdmin, {
      dryRun: body.dryRun,
      userId: body.userId ? String(body.userId) : null,
    });

    return NextResponse.json({ report });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha no backfill.';
    return NextResponse.json({ error: message }, { status: httpStatusFromMessage(message) });
  }
}
