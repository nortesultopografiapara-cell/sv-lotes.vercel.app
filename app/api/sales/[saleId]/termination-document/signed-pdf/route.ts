import { NextResponse } from 'next/server';
import {
  assertSaleDocumentSaleAccess,
  createSaleDocumentSignedUrl,
  SaleDocumentError,
} from '@/lib/saleDocumentService';
import { createAdminSupabase, getRequestAuthUser } from '@/lib/supabase/server';
import { SALE_DOCUMENT_TYPE_DESISTENCIA_ASSINADO } from '@/lib/termination-documents/signature';

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
      return NextResponse.json(
        { success: false, error: adminError || 'Supabase não configurado' },
        { status: 503 },
      );
    }

    const { saleId: raw } = await params;
    const saleId = String(raw || '').trim();
    if (!saleId) {
      return NextResponse.json({ success: false, error: 'saleId obrigatório.' }, { status: 400 });
    }

    const ctx = await assertSaleDocumentSaleAccess(admin, saleId, user.id);
    const { data } = await admin
      .from('sale_documents')
      .select('id')
      .eq('sale_id', saleId)
      .eq('company_id', ctx.companyId)
      .eq('document_type', SALE_DOCUMENT_TYPE_DESISTENCIA_ASSINADO)
      .is('deleted_at', null)
      .maybeSingle();
    if (!data?.id) {
      return NextResponse.json(
        {
          success: false,
          code: 'SIGNED_PDF_NOT_READY',
          error: 'Documento assinado ainda não disponível.',
        },
        { status: 409 },
      );
    }

    const signed = await createSaleDocumentSignedUrl(admin, {
      saleId,
      documentId: String(data.id),
      companyId: ctx.companyId,
    });
    const download = new URL(request.url).searchParams.get('download') === '1';
    if (download) {
      const fileRes = await fetch(signed.url);
      if (fileRes.ok) {
        const buf = await fileRes.arrayBuffer();
        const fileName = String(signed.fileName || 'termo-desistencia-assinado.pdf').replace(
          /"/g,
          '',
        );
        return new NextResponse(buf, {
          status: 200,
          headers: {
            'Content-Type': signed.mimeType || 'application/pdf',
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'Cache-Control': 'private, no-store',
          },
        });
      }
    }
    return NextResponse.redirect(signed.url, 302);
  } catch (err) {
    if (err instanceof SaleDocumentError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    console.error('[termination-document signed-pdf GET]', err);
    return NextResponse.json(
      { success: false, error: 'Erro ao baixar o documento assinado.' },
      { status: 500 },
    );
  }
}
