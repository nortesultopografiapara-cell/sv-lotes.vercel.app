import { NextResponse } from 'next/server';
import {
  assertSaleDocumentSaleAccess,
  createSaleDocumentMetadata,
  listSaleDocuments,
  SaleDocumentError,
  toSaleDocumentView,
} from '@/lib/saleDocumentService';
import {
  isUploadAllowedForCategory,
  normalizeSaleDocumentCategory,
} from '@/lib/saleDocuments';
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
    await assertSaleDocumentSaleAccess(supabase, saleId, user.id);

    const url = new URL(request.url);
    const category = normalizeSaleDocumentCategory(url.searchParams.get('category'));

    const rows = await listSaleDocuments(supabase, saleId, category);
    return NextResponse.json({
      documents: rows.map(toSaleDocumentView),
    });
  } catch (err) {
    if (err instanceof SaleDocumentError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales/documents GET]', err);
    return NextResponse.json({ error: 'Erro ao listar documentos da venda.' }, { status: 500 });
  }
}

/**
 * Registra metadata após upload direto no Storage (client).
 * Body JSON: category, document_type, description?, original_file_name, storage_path, mime_type, file_size
 */
export async function POST(
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
    const ctx = await assertSaleDocumentSaleAccess(supabase, saleId, user.id);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const category = normalizeSaleDocumentCategory(body.category);
    if (!category) {
      return NextResponse.json({ error: 'Categoria inválida.' }, { status: 400 });
    }
    if (!isUploadAllowedForCategory(category)) {
      return NextResponse.json(
        { error: 'Documentos gerados pelo sistema são reservados para integração futura.' },
        { status: 400 },
      );
    }

    const row = await createSaleDocumentMetadata(supabase, {
      saleId,
      ctx,
      userId: user.id,
      category,
      documentType: String(body.document_type || ''),
      description: body.description != null ? String(body.description) : null,
      originalFileName: String(body.original_file_name || ''),
      storagePath: String(body.storage_path || ''),
      mimeType: String(body.mime_type || ''),
      fileSize: Number(body.file_size) || 0,
    });

    return NextResponse.json({ document: toSaleDocumentView(row) }, { status: 201 });
  } catch (err) {
    if (err instanceof SaleDocumentError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales/documents POST]', err);
    return NextResponse.json({ error: 'Erro ao registrar documento.' }, { status: 500 });
  }
}
