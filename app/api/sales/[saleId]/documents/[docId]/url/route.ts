import { NextResponse } from 'next/server';
import {
  assertSaleDocumentSaleAccess,
  createSaleDocumentSignedUrl,
  SaleDocumentError,
} from '@/lib/saleDocumentService';
import { createAdminSupabase, getRequestAuthUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ saleId: string; docId: string }> },
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

    const { saleId, docId } = await params;
    const ctx = await assertSaleDocumentSaleAccess(supabase, saleId, user.id);
    const signed = await createSaleDocumentSignedUrl(supabase, {
      saleId,
      documentId: docId,
      companyId: ctx.companyId,
    });

    return NextResponse.json(signed);
  } catch (err) {
    if (err instanceof SaleDocumentError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales/documents url GET]', err);
    return NextResponse.json({ error: 'Erro ao gerar URL do documento.' }, { status: 500 });
  }
}
