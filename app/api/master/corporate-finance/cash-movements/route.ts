import { NextResponse } from 'next/server';
import {
  authorizeCorporateFinance,
  getCorporateFinanceServiceClient,
} from '@/lib/master/corporateFinance/apiAuth';
import { httpStatusFromMessage } from '@/lib/master/corporateFinance/arApApi';
import {
  cashMovementsToCsv,
  createManualCashMovement,
  listCashMovementsWithRunningBalance,
} from '@/lib/master/corporateFinance/cashMovementsService';
import { validateManualCashMovementInput } from '@/lib/master/corporateFinance/cashValidation';
import { logCorporateFinanceAudit } from '@/lib/master/corporateFinance/service';

export async function GET(request: Request) {
  const { client: supabaseAdmin, error: configError } = getCorporateFinanceServiceClient();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const auth = await authorizeCorporateFinance(supabaseAdmin, {
    userId: searchParams.get('userId'),
    impersonatingTenantId: searchParams.get('impersonatingTenantId'),
  });
  if (!auth.ok) return auth.response;

  try {
    const filters = {
      q: searchParams.get('q') || undefined,
      type: searchParams.get('type') || undefined,
      origin: searchParams.get('origin') || undefined,
      financialAccountId: searchParams.get('financialAccountId') || undefined,
      categoryId: searchParams.get('categoryId') || undefined,
      costCenterId: searchParams.get('costCenterId') || undefined,
      projectId: searchParams.get('projectId') || undefined,
      paymentMethod: searchParams.get('paymentMethod') || undefined,
      fromDate: searchParams.get('fromDate') || undefined,
      toDate: searchParams.get('toDate') || undefined,
      includeReversed: searchParams.get('includeReversed') === '1',
      page: Number(searchParams.get('page') || 1),
      limit: Number(searchParams.get('limit') || 50),
    };

    if (searchParams.get('export') === 'csv') {
      const full = await listCashMovementsWithRunningBalance(supabaseAdmin, {
        ...filters,
        page: 1,
        limit: 5000,
      });
      await logCorporateFinanceAudit(supabaseAdmin, {
        userId: searchParams.get('userId'),
        action: 'CORPORATE_CASH_EXPORT_CSV',
        entityId: 'cash-movements',
        description: `Exportação CSV fluxo de caixa (${full.movements.length} linhas)`,
      });
      return new NextResponse(cashMovementsToCsv(full.movements), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="fluxo-caixa-corporativo.csv"',
        },
      });
    }

    const result = await listCashMovementsWithRunningBalance(supabaseAdmin, filters);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao listar movimentos.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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

    const input = validateManualCashMovementInput(body);
    const movement = await createManualCashMovement(
      supabaseAdmin,
      input,
      body.userId ? String(body.userId) : null,
    );
    return NextResponse.json({ movement }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao criar movimento.';
    return NextResponse.json({ error: message }, { status: httpStatusFromMessage(message) });
  }
}
