import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { getTopographyEquipmentById } from '@/lib/master/topography/equipmentService';
import {
  listEquipmentDocuments,
  uploadEquipmentDocument,
} from '@/lib/master/topography/equipmentDocumentsService';
import { validateEquipmentDocumentMeta } from '@/lib/master/topography/equipmentDocumentValidation';

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
    const equipment = await getTopographyEquipmentById(supabaseAdmin, id);
    if (!equipment) {
      return NextResponse.json({ error: 'Equipamento não encontrado.' }, { status: 404 });
    }
    const documents = await listEquipmentDocuments(supabaseAdmin, id);
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

    const equipment = await getTopographyEquipmentById(supabaseAdmin, id);
    if (!equipment) {
      return NextResponse.json({ error: 'Equipamento não encontrado.' }, { status: 404 });
    }

    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Arquivo obrigatório.' }, { status: 400 });
    }

    const meta = validateEquipmentDocumentMeta({
      tipo: form.get('tipo'),
      titulo: form.get('titulo'),
      issued_at: form.get('issued_at'),
      valid_until: form.get('valid_until'),
      notes: form.get('notes'),
      maintenance_id: form.get('maintenance_id'),
    });

    const buffer = Buffer.from(await file.arrayBuffer());
    const document = await uploadEquipmentDocument(supabaseAdmin, {
      equipmentId: id,
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
      message.includes('vazio')
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
