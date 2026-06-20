import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { deleteCancelledSaasCharge } from '@/lib/saasCharges';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * DELETE /api/saas/billing/charges/[id]?userId=
 * Exclusão definitiva (soft delete) de cobrança cancelada — Master/Super Admin.
 */
export async function DELETE(request: Request, context: RouteContext) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { id: chargeId } = await context.params;
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  const auth = await assertSuperAdmin(supabaseAdmin, userId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  if (!chargeId?.trim()) {
    return NextResponse.json({ error: 'ID da cobrança obrigatório.' }, { status: 400 });
  }

  try {
    const result = await deleteCancelledSaasCharge(
      supabaseAdmin,
      chargeId.trim(),
      userId,
    );
    return NextResponse.json({ success: true, ...result });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro ao excluir cobrança';
    const status = /não encontrada|nao encontrada|já foi excluída/i.test(message)
      ? 404
      : /Somente cobranças canceladas|Não foi possível excluir/i.test(message)
        ? 409
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
