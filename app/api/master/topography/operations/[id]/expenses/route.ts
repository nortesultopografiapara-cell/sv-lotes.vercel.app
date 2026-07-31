import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { getTopographyOperationById } from '@/lib/master/topography/operationService';
import {
  createOperationExpense,
  listOperationExpenses,
} from '@/lib/master/topography/operationExpenseService';
import { validateOperationExpenseInput } from '@/lib/master/topography/operationExpenseValidation';

type Ctx = { params: Promise<{ id: string }> };

function clientErrorStatus(message: string): number {
  if (message.includes('não encontrad')) return 404;
  if (message.includes('obrigatório') || message.includes('inválid') || message.includes('positivo')) {
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
    const expenses = await listOperationExpenses(supabaseAdmin, id, { includeArchived });
    return NextResponse.json({ expenses });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao listar despesas.';
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

    const input = validateOperationExpenseInput(body);
    const expense = await createOperationExpense(
      supabaseAdmin,
      id,
      input,
      body.userId ? String(body.userId) : null,
    );

    return NextResponse.json({ expense }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao criar despesa.';
    return NextResponse.json({ error: message }, { status: clientErrorStatus(message) });
  }
}
