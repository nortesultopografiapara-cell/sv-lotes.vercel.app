import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { getTopographyOperationById } from '@/lib/master/topography/operationService';
import {
  listOperationEquipment,
  reserveOperationEquipment,
} from '@/lib/master/topography/operationEquipmentService';
import { validateOperationEquipmentInput } from '@/lib/master/topography/operationEquipmentValidation';

type Ctx = { params: Promise<{ id: string }> };

function clientErrorStatus(message: string): number {
  if (message.includes('não encontrad')) return 404;
  if (
    message.includes('obrigatório') ||
    message.includes('inválid') ||
    message.includes('não pode') ||
    message.includes('arquivado') ||
    message.includes('já reservado') ||
    message.includes('status')
  ) {
    return 400;
  }
  return 500;
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

  const { id } = await context.params;
  try {
    const operation = await getTopographyOperationById(supabaseAdmin, id);
    if (!operation) {
      return NextResponse.json({ error: 'Operação não encontrada.' }, { status: 404 });
    }

    const equipment = await listOperationEquipment(supabaseAdmin, id);
    return NextResponse.json({ equipment });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao listar equipamentos.';
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
    const body = await request.json();
    const auth = await assertSuperAdmin(supabaseAdmin, body.userId);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const operation = await getTopographyOperationById(supabaseAdmin, id);
    if (!operation) {
      return NextResponse.json({ error: 'Operação não encontrada.' }, { status: 404 });
    }

    const input = validateOperationEquipmentInput(body);
    const link = await reserveOperationEquipment(
      supabaseAdmin,
      id,
      input,
      body.userId ? String(body.userId) : null,
    );

    return NextResponse.json({ link }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao reservar equipamento.';
    return NextResponse.json({ error: message }, { status: clientErrorStatus(message) });
  }
}
