import { NextResponse } from 'next/server';
import {
  authorizeCorporateFinance,
  getCorporateFinanceServiceClient,
} from '@/lib/master/corporateFinance/apiAuth';
import { httpStatusFromMessage } from '@/lib/master/corporateFinance/arApApi';
import { createAccountTransfer } from '@/lib/master/corporateFinance/cashMovementsService';
import { validateTransferInput } from '@/lib/master/corporateFinance/cashValidation';

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

    const input = validateTransferInput(body);
    const result = await createAccountTransfer(
      supabaseAdmin,
      input,
      body.userId ? String(body.userId) : null,
    );
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha na transferência.';
    return NextResponse.json({ error: message }, { status: httpStatusFromMessage(message) });
  }
}
