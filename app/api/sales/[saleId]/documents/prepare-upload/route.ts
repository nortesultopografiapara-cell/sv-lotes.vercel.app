import { NextResponse } from 'next/server';
import {
  assertSaleDocumentSaleAccess,
  buildUploadStoragePathForSale,
  SaleDocumentError,
} from '@/lib/saleDocumentService';
import {
  isUploadAllowedForCategory,
  normalizeSaleDocumentCategory,
  SALE_DOCUMENTS_STORAGE_BUCKET,
  validateSaleDocumentFileSize,
  validateSaleDocumentMimeType,
  validateSaleDocumentType,
} from '@/lib/saleDocuments';
import { createAdminSupabase, getRequestAuthUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Retorna caminho + bucket para upload direto no Storage pelo client autenticado.
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

    const documentType = String(body.document_type || '');
    const typeCheck = validateSaleDocumentType(category, documentType);
    if (!typeCheck.valid) {
      return NextResponse.json({ error: typeCheck.message }, { status: 400 });
    }

    const fileName = String(body.original_file_name || body.file_name || '');
    const mimeCheck = validateSaleDocumentMimeType(String(body.mime_type || ''), fileName);
    if (!mimeCheck.valid) {
      return NextResponse.json({ error: mimeCheck.message }, { status: 400 });
    }

    const sizeCheck = validateSaleDocumentFileSize(Number(body.file_size) || 0);
    if (!sizeCheck.valid) {
      return NextResponse.json({ error: sizeCheck.message }, { status: 400 });
    }

    const storagePath = buildUploadStoragePathForSale({
      ctx,
      saleId,
      category,
      fileName,
    });

    return NextResponse.json({
      bucket: SALE_DOCUMENTS_STORAGE_BUCKET,
      storage_path: storagePath,
      company_id: ctx.companyId,
      project_id: ctx.projectId,
      mime_type: mimeCheck.mimeType,
    });
  } catch (err) {
    if (err instanceof SaleDocumentError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales/documents prepare-upload]', err);
    return NextResponse.json({ error: 'Erro ao preparar upload.' }, { status: 500 });
  }
}
