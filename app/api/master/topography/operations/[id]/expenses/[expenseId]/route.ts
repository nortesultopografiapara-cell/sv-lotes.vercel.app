import { authorizePlatformAdminRequest } from '@/lib/security/adminAuthorization';
import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import { getTopographyOperationById } from '@/lib/master/topography/operationService';
import {
  archiveOperationExpense,
  updateOperationExpense,
} from '@/lib/master/topography/operationExpenseService';
import { validateOperationExpenseInput } from '@/lib/master/topography/operationExpenseValidation';

type Ctx = { params: Promise<{ id: string; expenseId: string }> };

function clientErrorStatus(message: string): number {
  if (message.includes('não encontrad')) return 404;
  if (message.includes('obrigatório') || message.includes('inválid') || message.includes('positivo')) {
    return 400;
  }
  return 500;
}

export async function PATCH(request: Request, context: Ctx) {
  
  const { id, expenseId } = await context.params;

  try {
    const body = await request.json();
    const auth = await authorizePlatformAdminRequest(request, body.userId);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }


    const operation = await getTopographyOperationById(supabaseAdmin, id);
    if (!operation) {
      return NextResponse.json({ error: 'Operação não encontrada.' }, { status: 404 });
    }

    const input = validateOperationExpenseInput(body);
    const expense = await updateOperationExpense(
      supabaseAdmin,
      id,
      expenseId,
      input,
      body.userId ? String(body.userId) : null,
    );

    return NextResponse.json({ expense });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao atualizar despesa.';
    return NextResponse.json({ error: message }, { status: clientErrorStatus(message) });
  }
}

export async function DELETE(request: Request, context: Ctx) {
  
  const { id, expenseId } = await context.params;

  try {
    const body = await request.json().catch(() => ({}));
    const auth = await authorizePlatformAdminRequest(request, body.userId ?? null);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }


    const operation = await getTopographyOperationById(supabaseAdmin, id);
    if (!operation) {
      return NextResponse.json({ error: 'Operação não encontrada.' }, { status: 404 });
    }

    const expense = await archiveOperationExpense(
      supabaseAdmin,
      id,
      expenseId,
      body.userId ? String(body.userId) : null,
    );

    return NextResponse.json({ expense });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao arquivar despesa.';
    return NextResponse.json({ error: message }, { status: clientErrorStatus(message) });
  }
}
