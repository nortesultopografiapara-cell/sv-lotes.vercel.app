import { NextResponse } from 'next/server';
import {
  assertSaleDocumentSaleAccess,
  createSaleDocumentSignedUrl,
  SaleDocumentError,
} from '@/lib/saleDocumentService';
import { createAdminSupabase, getRequestAuthUser } from '@/lib/supabase/server';
import { loadTerminationDocumentBySale } from '@/lib/termination-documents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ saleId: string }> },
) {
  try {
    const { user, configError } = await getRequestAuthUser(request);
    if (configError || !user) {
      return NextResponse.json({ success: false, error: configError || 'Não autenticado' }, { status: 401 });
    }
    const { client: admin, configError: adminError } = createAdminSupabase();
    if (!admin || adminError) {
      return NextResponse.json({ success: false, error: adminError || 'Supabase não configurado' }, { status: 503 });
    }

    const { saleId: raw } = await params;
    const saleId = String(raw || '').trim();
    if (!saleId) {
      return NextResponse.json({ success: false, error: 'saleId obrigatório.' }, { status: 400 });
    }

    const ctx = await assertSaleDocumentSaleAccess(admin, saleId, user.id);
    const loaded = await loadTerminationDocumentBySale(admin, {
      saleId,
      companyId: ctx.companyId,
    });
    if (!loaded?.documentId || loaded.documentStatus !== 'GENERATED') {
      return NextResponse.json(
        {
          success: false,
          code: 'DOCUMENT_PDF_NOT_READY',
          error: 'PDF ainda não materializado. Use Tentar gerar PDF.',
        },
        { status: 409 },
      );
    }

    const signed = await createSaleDocumentSignedUrl(admin, {
      saleId,
      documentId: loaded.documentId,
      companyId: ctx.companyId,
    });
    return NextResponse.redirect(signed.url, 302);
  } catch (err) {
    if (err instanceof SaleDocumentError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    console.error('[termination-document pdf GET]', err);
    return NextResponse.json({ success: false, error: 'Erro ao baixar o PDF do termo.' }, { status: 500 });
  }
}
