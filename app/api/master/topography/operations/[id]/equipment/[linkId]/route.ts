import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { getTopographyOperationById } from '@/lib/master/topography/operationService';
import {
  checkoutOperationEquipment,
  returnOperationEquipment,
} from '@/lib/master/topography/operationEquipmentService';

type Ctx = { params: Promise<{ id: string; linkId: string }> };

function clientErrorStatus(message: string): number {
  if (message.includes('não encontrad')) return 404;
  if (
    message.includes('obrigatório') ||
    message.includes('inválid') ||
    message.includes('já devolvido') ||
    message.includes('já retirado')
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

  const { id, linkId } = await context.params;

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

    const action = String(body.action || '').trim().toLowerCase();
    const userId = body.userId ? String(body.userId) : null;

    if (action === 'checkout') {
      const link = await checkoutOperationEquipment(supabaseAdmin, id, linkId, {
        condition_out: body.condition_out ?? body.conditionOut ?? null,
        userId,
      });
      return NextResponse.json({ link });
    }

    if (action === 'return') {
      const link = await returnOperationEquipment(supabaseAdmin, id, linkId, {
        condition_return: body.condition_return ?? body.conditionReturn ?? null,
        notes: body.notes ?? null,
        userId,
      });
      return NextResponse.json({ link });
    }

    return NextResponse.json(
      { error: 'Ação inválida. Use action: checkout ou return.' },
      { status: 400 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao atualizar equipamento.';
    return NextResponse.json({ error: message }, { status: clientErrorStatus(message) });
  }
}
