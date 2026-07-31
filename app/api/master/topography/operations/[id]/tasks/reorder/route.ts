import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { getTopographyOperationById } from '@/lib/master/topography/operationService';
import { reorderOperationTasks } from '@/lib/master/topography/operationTaskService';

type Ctx = { params: Promise<{ id: string }> };

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

    const orderedIds = body.orderedIds ?? body.ordered_ids;
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return NextResponse.json({ error: 'orderedIds é obrigatório.' }, { status: 400 });
    }

    const ids = orderedIds.map((x: unknown) => String(x).trim()).filter(Boolean);
    if (ids.length !== orderedIds.length) {
      return NextResponse.json({ error: 'IDs inválidos na lista.' }, { status: 400 });
    }

    await reorderOperationTasks(supabaseAdmin, id, ids);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao reordenar checklist.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
