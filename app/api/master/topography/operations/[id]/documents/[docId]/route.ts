import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { getTopographyOperationById } from '@/lib/master/topography/operationService';
import {
  createOperationDocumentSignedUrl,
  getOperationDocumentById,
  softDeleteOperationDocument,
} from '@/lib/master/topography/operationDocumentsService';

type Ctx = { params: Promise<{ id: string; docId: string }> };

export async function GET(request: Request, context: Ctx) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const auth = await assertSuperAdmin(supabaseAdmin, searchParams.get('userId'));
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const { id, docId } = await context.params;
  const download = searchParams.get('download') === '1';

  try {
    const operation = await getTopographyOperationById(supabaseAdmin, id);
    if (!operation) {
      return NextResponse.json({ error: 'Operação não encontrada.' }, { status: 404 });
    }

    const document = await getOperationDocumentById(supabaseAdmin, id, docId);
    if (!document || document.deleted_at) {
      return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 });
    }

    const url = await createOperationDocumentSignedUrl(supabaseAdmin, document.storage_path, 120);

    if (download || searchParams.get('redirect') === '1') {
      return NextResponse.redirect(url);
    }

    return NextResponse.json({ url, document });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha no download.';
    const status = message.includes('não encontrado') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request, context: Ctx) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { id, docId } = await context.params;

  try {
    const body = await request.json().catch(() => ({}));
    const auth = await assertSuperAdmin(supabaseAdmin, body.userId ?? null);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const operation = await getTopographyOperationById(supabaseAdmin, id);
    if (!operation) {
      return NextResponse.json({ error: 'Operação não encontrada.' }, { status: 404 });
    }

    const document = await softDeleteOperationDocument(supabaseAdmin, {
      operationId: id,
      documentId: docId,
      deletedBy: body.userId ? String(body.userId) : null,
    });

    return NextResponse.json({ document });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao excluir documento.';
    const status =
      message.includes('não encontrado') || message.includes('já excluído') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
