import { NextResponse } from 'next/server';
import {
  assertLegacyContractSaleAccess,
  LegacyContractDocumentError,
  loadLegacyContractDocumentBySaleId,
  toLegacyContractDocumentView,
} from '@/lib/legacyContractDocumentService';
import { createAdminSupabase, getRequestAuthUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ saleId: string }> },
) {
  try {
    const { user, configError } = await getRequestAuthUser(request);
    if (configError || !user) {
      return NextResponse.json({ error: configError || 'Não autenticado' }, { status: 401 });
    }

    const { client: supabase, configError: adminError } = createAdminSupabase();
    if (!supabase || adminError) {
      return NextResponse.json({ error: adminError || 'Supabase não configurado' }, { status: 503 });
    }

    const { saleId } = await params;
    await assertLegacyContractSaleAccess(supabase, saleId, user.id);

    const document = await loadLegacyContractDocumentBySaleId(supabase, saleId);
    if (!document) {
      return NextResponse.json({ document: null });
    }

    return NextResponse.json({
      document: toLegacyContractDocumentView(document),
    });
  } catch (err) {
    if (err instanceof LegacyContractDocumentError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    console.error('[sales/legacy-contract GET]', err);
    return NextResponse.json({ error: 'Erro interno ao consultar contrato antigo.' }, { status: 500 });
  }
}
