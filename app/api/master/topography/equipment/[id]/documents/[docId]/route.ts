import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  createEquipmentDocumentSignedUrl,
  softDeleteEquipmentDocument,
} from '@/lib/master/topography/equipmentDocumentsService';

type Ctx = { params: Promise<{ id: string; docId: string }> };

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

    const document = await softDeleteEquipmentDocument(supabaseAdmin, {
      equipmentId: id,
      documentId: docId,
      deletedBy: body.userId ? String(body.userId) : null,
    });

    return NextResponse.json({ document });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao excluir documento.';
    const status = message.includes('não encontrado') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

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
    const { url, document } = await createEquipmentDocumentSignedUrl(supabaseAdmin, {
      equipmentId: id,
      documentId: docId,
      expiresIn: 120,
    });

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
