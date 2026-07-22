import { NextResponse } from 'next/server';
import {
  authorizeCorporateFinance,
  getCorporateFinanceServiceClient,
} from '@/lib/master/corporateFinance/apiAuth';
import { httpStatusFromMessage, parseArApListFilters } from '@/lib/master/corporateFinance/arApApi';
import { validateReceivableInput } from '@/lib/master/corporateFinance/arApValidation';
import {
  createReceivable,
  listReceivables,
  receivablesToCsv,
} from '@/lib/master/corporateFinance/receivablesService';
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
    const filters = parseArApListFilters(searchParams);
    const result = await listReceivables(supabaseAdmin, filters);

    if (searchParams.get('export') === 'csv') {
      const csv = receivablesToCsv(result.receivables);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="contas-a-receber.csv"',
        },
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao listar recebíveis.';
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

    const input = validateReceivableInput(body);
    const receivable = await createReceivable(
      supabaseAdmin,
      input,
      body.userId ? String(body.userId) : null,
    );

    await logCorporateFinanceAudit(supabaseAdmin, {
      userId: body.userId ? String(body.userId) : null,
      action: 'CORPORATE_RECEIVABLE_CREATED',
      entityId: receivable.id,
      description: `Recebível criado ${receivable.code}: ${receivable.customer_name}`,
      newData: {
        code: receivable.code,
        net_amount: receivable.net_amount,
        status: receivable.status,
      },
    });

    return NextResponse.json({ receivable }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao criar recebível.';
    return NextResponse.json({ error: message }, { status: httpStatusFromMessage(message) });
  }
}
