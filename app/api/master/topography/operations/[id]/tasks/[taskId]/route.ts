import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { getTopographyOperationById } from '@/lib/master/topography/operationService';
import {
  deleteOperationTask,
  updateOperationTask,
} from '@/lib/master/topography/operationTaskService';
import { validateOperationTaskInput } from '@/lib/master/topography/operationTaskValidation';

type Ctx = { params: Promise<{ id: string; taskId: string }> };

function clientErrorStatus(message: string): number {
  if (message.includes('não encontrad')) return 404;
  if (message.includes('obrigatório') || message.includes('inválid')) return 400;
  return 500;
}

export async function PATCH(request: Request, context: Ctx) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { id, taskId } = await context.params;

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

    const input = validateOperationTaskInput(body);
    const task = await updateOperationTask(
      supabaseAdmin,
      id,
      taskId,
      input,
      body.userId ? String(body.userId) : null,
    );

    return NextResponse.json({ task });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao atualizar item.';
    return NextResponse.json({ error: message }, { status: clientErrorStatus(message) });
  }
}

export async function DELETE(request: Request, context: Ctx) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { id, taskId } = await context.params;

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

    await deleteOperationTask(
      supabaseAdmin,
      id,
      taskId,
      body.userId ? String(body.userId) : null,
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao excluir item.';
    return NextResponse.json({ error: message }, { status: clientErrorStatus(message) });
  }
}
