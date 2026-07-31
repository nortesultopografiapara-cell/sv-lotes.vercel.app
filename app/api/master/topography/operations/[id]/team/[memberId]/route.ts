import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { getTopographyOperationById } from '@/lib/master/topography/operationService';
import {
  archiveOperationTeamMember,
  updateOperationTeamMember,
} from '@/lib/master/topography/operationTeamService';
import { validateOperationTeamInput } from '@/lib/master/topography/operationTeamValidation';

type Ctx = { params: Promise<{ id: string; memberId: string }> };

function clientErrorStatus(message: string): number {
  if (message.includes('não encontrad')) return 404;
  if (
    message.includes('obrigatório') ||
    message.includes('inválid') ||
    message.includes('não pode') ||
    message.includes('Informe')
  ) {
    return 400;
  }
  return 500;
}

export async function PATCH(request: Request, context: Ctx) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { id, memberId } = await context.params;

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
    const member = await updateOperationTeamMember(
      supabaseAdmin,
      id,
      memberId,
      input,
      body.userId ? String(body.userId) : null,
    );

    return NextResponse.json({ member });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao atualizar integrante.';
    return NextResponse.json({ error: message }, { status: clientErrorStatus(message) });
  }
}

export async function DELETE(request: Request, context: Ctx) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { id, memberId } = await context.params;

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

    const member = await archiveOperationTeamMember(
      supabaseAdmin,
      id,
      memberId,
      body.userId ? String(body.userId) : null,
    );

    return NextResponse.json({ member });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao remover integrante.';
    return NextResponse.json({ error: message }, { status: clientErrorStatus(message) });
  }
}
