import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { getTopographyOperationById } from '@/lib/master/topography/operationService';
import {
  createOperationTeamMember,
  listOperationTeam,
} from '@/lib/master/topography/operationTeamService';
import { validateOperationTeamInput } from '@/lib/master/topography/operationTeamValidation';

type Ctx = { params: Promise<{ id: string }> };

function clientErrorStatus(message: string): number {
  if (message.includes('não encontrad')) return 404;
  if (
    message.includes('obrigatório') ||
    message.includes('inválid') ||
    message.includes('não pode') ||
    message.includes('exige') ||
    message.includes('Transição') ||
    message.includes('Referência') ||
    message.includes('Informe')
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

    const includeArchived =
      searchParams.get('includeArchived') === '1' ||
      searchParams.get('include_archived') === '1';
    const team = await listOperationTeam(supabaseAdmin, id, { includeArchived });
    return NextResponse.json({ team });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao listar equipe.';
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

    const input = validateOperationTeamInput(body);
    const member = await createOperationTeamMember(
      supabaseAdmin,
      id,
      input,
      body.userId ? String(body.userId) : null,
    );

    return NextResponse.json({ member }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao adicionar integrante.';
    return NextResponse.json({ error: message }, { status: clientErrorStatus(message) });
  }
}
