import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { getTopographyOperationById } from '@/lib/master/topography/operationService';
import {
  listOperationDocuments,
  uploadOperationDocument,
} from '@/lib/master/topography/operationDocumentsService';
import { validateOperationDocumentInput } from '@/lib/master/topography/operationDocumentValidation';

type Ctx = { params: Promise<{ id: string }> };

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

  const { id } = await context.params;
  try {
    const operation = await getTopographyOperationById(supabaseAdmin, id);
    if (!operation) {
      return NextResponse.json({ error: 'Operação não encontrada.' }, { status: 404 });
    }

    const includeDeleted =
      searchParams.get('includeDeleted') === '1' ||
      searchParams.get('include_deleted') === '1';
    const documents = await listOperationDocuments(supabaseAdmin, id, { includeDeleted });
    return NextResponse.json({ documents });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao listar documentos.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, context: Ctx) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { id } = await context.params;

  try {
    const form = await request.formData();
    const userId = String(form.get('userId') || '');
    const auth = await assertSuperAdmin(supabaseAdmin, userId || null);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const operation = await getTopographyOperationById(supabaseAdmin, id);
    if (!operation) {
      return NextResponse.json({ error: 'Operação não encontrada.' }, { status: 404 });
    }

    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Arquivo obrigatório.' }, { status: 400 });
    }

    const meta = validateOperationDocumentInput({
      type: form.get('type'),
      title: form.get('title'),
      notes: form.get('notes'),
    });

    const buffer = Buffer.from(await file.arrayBuffer());
    const document = await uploadOperationDocument(supabaseAdmin, {
      operationId: id,
      meta,
      fileName: file.name || 'arquivo',
      mimeType: file.type || '',
      buffer,
      createdBy: userId || null,
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha no upload.';
    const status =
      message.includes('obrigatório') ||
      message.includes('inválid') ||
      message.includes('não permitido') ||
      message.includes('excede') ||
      message.includes('duplicado') ||
      message.includes('vazio') ||
      message.includes('não encontrada')
        ? message.includes('não encontrada')
          ? 404
          : 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
