import { NextResponse } from 'next/server';
import {
  authorizeCorporateFinance,
  getCorporateFinanceServiceClient,
} from '@/lib/master/corporateFinance/apiAuth';
import { httpStatusFromMessage } from '@/lib/master/corporateFinance/arApApi';
import { getReceivableProjectContext } from '@/lib/master/corporateFinance/projectContextService';

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
    const projectId = searchParams.get('projectId');
    if (!projectId) {
      return NextResponse.json({ error: 'projectId é obrigatório.' }, { status: 400 });
    }
    const context = await getReceivableProjectContext(supabaseAdmin, projectId);
    return NextResponse.json({ context });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao carregar contexto.';
    return NextResponse.json({ error: message }, { status: httpStatusFromMessage(message) });
  }
}
