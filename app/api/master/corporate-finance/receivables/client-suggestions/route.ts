import { NextResponse } from 'next/server';
import {
  authorizeCorporateFinance,
  getCorporateFinanceServiceClient,
} from '@/lib/master/corporateFinance/apiAuth';
import { httpStatusFromMessage } from '@/lib/master/corporateFinance/arApApi';
import { searchMasterClientSuggestions } from '@/lib/master/corporateFinance/projectContextService';

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
    const q = searchParams.get('q') || '';
    const clients = await searchMasterClientSuggestions(supabaseAdmin, q);
    return NextResponse.json({ clients });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao buscar clientes.';
    return NextResponse.json({ error: message }, { status: httpStatusFromMessage(message) });
  }
}
