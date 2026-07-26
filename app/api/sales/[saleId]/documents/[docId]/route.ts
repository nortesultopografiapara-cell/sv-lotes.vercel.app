import { NextResponse } from 'next/server';
import {
  assertSaleDocumentSaleAccess,
  removeSaleDocumentStorageObject,
  SaleDocumentError,
  softDeleteSaleDocument,
  toSaleDocumentView,
  updateSaleDocumentDescription,
} from '@/lib/saleDocumentService';
import { createAdminSupabase, getRequestAuthUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function PATCH(
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
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const row = await updateSaleDocumentDescription(supabase, {
      saleId,
      documentId: docId,
      companyId: ctx.companyId,
      description: String(body.description ?? ''),
    });

    return NextResponse.json({ document: toSaleDocumentView(row) });
  } catch (err) {
    if (err instanceof SaleDocumentError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales/documents PATCH]', err);
    return NextResponse.json({ error: 'Erro ao atualizar documento.' }, { status: 500 });
  }
}

export async function DELETE(
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
    const { storagePath } = await softDeleteSaleDocument(supabase, {
      saleId,
      documentId: docId,
      companyId: ctx.companyId,
    });
    await removeSaleDocumentStorageObject(supabase, storagePath);

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof SaleDocumentError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales/documents DELETE]', err);
    return NextResponse.json({ error: 'Erro ao excluir documento.' }, { status: 500 });
  }
}
