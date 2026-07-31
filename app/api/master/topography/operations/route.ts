import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  createTopographyOperation,
  listTopographyOperations,
  logTopographyOperationAudit,
} from '@/lib/master/topography/operationService';
import { validateTopographyOperationInput } from '@/lib/master/topography/operationValidation';

export async function GET(request: Request) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const auth = await assertSuperAdmin(supabaseAdmin, userId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  try {
    const result = await listTopographyOperations(supabaseAdmin, {
      q: searchParams.get('q') || undefined,
      status: searchParams.get('status') || undefined,
      priority: searchParams.get('priority') || undefined,
      projectId: searchParams.get('projectId') || undefined,
      quoteId: searchParams.get('quoteId') || undefined,
      clientId: searchParams.get('clientId') || undefined,
      responsible: searchParams.get('responsible') || undefined,
      equipmentId: searchParams.get('equipmentId') || undefined,
      openOccurrence: searchParams.get('openOccurrence') === '1',
      pendingChecklist: searchParams.get('pendingChecklist') === '1',
      scheduledFrom: searchParams.get('scheduledFrom') || undefined,
      scheduledTo: searchParams.get('scheduledTo') || undefined,
      includeArchived: searchParams.get('includeArchived') === '1',
      page: Number(searchParams.get('page') || 1),
      limit: Number(searchParams.get('limit') || 20),
      sort:
        (searchParams.get('sort') as
          | 'created_at'
          | 'title'
          | 'code'
          | 'scheduled_start'
          | 'priority'
          | 'status') || 'created_at',
      order: searchParams.get('order') === 'asc' ? 'asc' : 'desc',
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao listar operações.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  try {
    const body = await request.json();
    const auth = await assertSuperAdmin(supabaseAdmin, body.userId);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const input = validateTopographyOperationInput(body);
    const operation = await createTopographyOperation(
      supabaseAdmin,
      input,
      body.userId ? String(body.userId) : null,
    );

    await logTopographyOperationAudit(supabaseAdmin, {
      userId: body.userId ? String(body.userId) : null,
      action: 'TOPOGRAPHY_OPERATION_CREATED',
      entityId: operation.id,
      description: `Operação ${operation.code} criada: ${operation.title}`,
      newData: {
        code: operation.code,
        title: operation.title,
        status: operation.status,
        priority: operation.priority,
      },
    });

    return NextResponse.json({ operation }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao criar operação.';
    const status =
      message.includes('obrigatório') ||
      message.includes('inválid') ||
      message.includes('não pode') ||
      message.includes('exige') ||
      message.includes('Transição')
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
