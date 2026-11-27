import { NextResponse } from 'next/server';
import {
  authorizeCorporateFinance,
  getCorporateFinanceServiceClient,
} from '@/lib/master/corporateFinance/apiAuth';
import { httpStatusFromMessage, parseArApListFilters } from '@/lib/master/corporateFinance/arApApi';
import { validatePayableInput } from '@/lib/master/corporateFinance/arApValidation';
import {
  createPayable,
  listPayables,
  payablesToCsv,
} from '@/lib/master/corporateFinance/payablesService';
import { logCorporateFinanceAudit } from '@/lib/master/corporateFinance/service';

export async function GET(request: Request) {
  
  const { searchParams } = new URL(request.url);
  const auth = await authorizeCorporateFinance(request, {
    userId: searchParams.get('userId'),
    impersonatingTenantId: searchParams.get('impersonatingTenantId'),
  });
  if (!auth.ok) return auth.response;
const { client: supabaseAdmin, error: configError } = getCorporateFinanceServiceClient();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }


  try {
    const filters = parseArApListFilters(searchParams);
    const result = await listPayables(supabaseAdmin, filters);

    if (searchParams.get('export') === 'csv') {
      const csv = payablesToCsv(result.payables);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="contas-a-pagar.csv"',
        },
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao listar pagáveis.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  
  try {
    const body = await request.json();
    const auth = await authorizeCorporateFinance(request, {
      userId: body.userId,
      impersonatingTenantId: body.impersonatingTenantId,
    });
    if (!auth.ok) return auth.response;
const { client: supabaseAdmin, error: configError } = getCorporateFinanceServiceClient();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }


    const input = validatePayableInput(body);
    const payable = await createPayable(
      supabaseAdmin,
      input,
      body.userId ? String(body.userId) : null,
    );

    await logCorporateFinanceAudit(supabaseAdmin, {
      userId: body.userId ? String(body.userId) : null,
      action: 'CORPORATE_PAYABLE_CREATED',
      entityId: payable.id,
      description: `Pagável criado ${payable.code}: ${payable.supplier_name}`,
      newData: {
        code: payable.code,
        net_amount: payable.net_amount,
        status: payable.status,
      },
    });

    return NextResponse.json({ payable }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao criar pagável.';
    return NextResponse.json({ error: message }, { status: httpStatusFromMessage(message) });
  }
}
