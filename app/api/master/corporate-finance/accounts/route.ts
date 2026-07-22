import { NextResponse } from 'next/server';
import {
  authorizeCorporateFinance,
  getCorporateFinanceServiceClient,
} from '@/lib/master/corporateFinance/apiAuth';
import {
  createCorporateAccount,
  listCorporateAccounts,
  logCorporateFinanceAudit,
} from '@/lib/master/corporateFinance/service';
import { validateCorporateAccountInput } from '@/lib/master/corporateFinance/validation';

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
    const accounts = await listCorporateAccounts(supabaseAdmin, {
      includeInactive: searchParams.get('includeInactive') === '1',
    });
    return NextResponse.json({ accounts });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao listar contas.';
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

    const input = validateCorporateAccountInput(body);
    const account = await createCorporateAccount(
      supabaseAdmin,
      input,
      body.userId ? String(body.userId) : null,
    );

    await logCorporateFinanceAudit(supabaseAdmin, {
      userId: body.userId ? String(body.userId) : null,
      action: 'CORPORATE_ACCOUNT_CREATED',
      entityId: account.id,
      description: `Conta financeira criada: ${account.name}`,
      newData: {
        name: account.name,
        account_type: account.account_type,
        opening_balance: account.opening_balance,
        opening_balance_date: account.opening_balance_date,
        is_active: account.is_active,
      },
    });

    return NextResponse.json({ account }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao criar conta.';
    const status = message.includes('obrigatório') || message.includes('inválid') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
