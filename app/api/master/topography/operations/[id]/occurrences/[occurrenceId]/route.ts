import { authorizePlatformAdminRequest } from '@/lib/security/adminAuthorization';
import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import { getTopographyOperationById } from '@/lib/master/topography/operationService';
import { updateOperationOccurrence } from '@/lib/master/topography/operationOccurrenceService';
import { validateOperationOccurrenceInput } from '@/lib/master/topography/operationOccurrenceValidation';

type Ctx = { params: Promise<{ id: string; occurrenceId: string }> };

function clientErrorStatus(message: string): number {
  if (message.includes('não encontrad')) return 404;
  if (message.includes('obrigatório') || message.includes('inválid')) return 400;
  return 500;
}

export async function PATCH(request: Request, context: Ctx) {
  
  const { id, occurrenceId } = await context.params;

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

    const input = validateOperationOccurrenceInput(body);
    const occurrence = await updateOperationOccurrence(
      supabaseAdmin,
      id,
      occurrenceId,
      input,
      body.userId ? String(body.userId) : null,
    );

    return NextResponse.json({ occurrence });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao atualizar ocorrência.';
    return NextResponse.json({ error: message }, { status: clientErrorStatus(message) });
  }
}
