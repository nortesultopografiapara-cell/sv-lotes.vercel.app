import { NextResponse } from 'next/server';
import {
  LotSwapPreviewError,
  prepareSaleLotSwapPlan,
} from '@/lib/finance/saleLotSwapPlanService';
import { createAdminSupabase, getRequestAuthUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errorResponse(err: LotSwapPreviewError) {
  return NextResponse.json(
    {
      success: false,
      code: err.code,
      message: err.message,
      error: err.message,
      mutation: false,
      execute: false,
    },
    { status: err.status },
  );
}

/** Confirma o plano CALCULATED. Sem execução e sem alterar venda/lote/parcelas. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ saleId: string }> },
) {
  try {
    const { user, configError } = await getRequestAuthUser(request);
    if (configError || !user) {
      return NextResponse.json(
        {
          success: false,
          code: 'UNAUTHORIZED',
          message: configError || 'Sessão ou autorização inválida.',
          error: configError || 'Sessão ou autorização inválida.',
          mutation: false,
          execute: false,
        },
        { status: 401 },
      );
    }
    const { client: admin, configError: adminError } = createAdminSupabase();
    if (!admin || adminError) {
      return NextResponse.json(
        {
          success: false,
          code: 'SUPABASE_CONFIG',
          message: adminError || 'Supabase não configurado',
          error: adminError || 'Supabase não configurado',
          mutation: false,
          execute: false,
        },
        { status: 503 },
      );
    }
    const { saleId: raw } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const prepared = await prepareSaleLotSwapPlan(admin, {
      saleId: String(raw || '').trim(),
      userId: user.id,
      toBlockId: body.toBlockId != null ? String(body.toBlockId) : null,
      reason: body.reason != null ? String(body.reason) : null,
      reasonDetail: body.reasonDetail != null ? String(body.reasonDetail) : null,
      idempotencyKey:
        body.idempotencyKey != null ? String(body.idempotencyKey) : null,
    });
    return NextResponse.json({ success: true, prepared });
  } catch (err) {
    if (err instanceof LotSwapPreviewError) return errorResponse(err);
    console.error('[sales/lot-swap/plan POST]', err);
    return NextResponse.json(
      {
        success: false,
        code: 'LOT_SWAP_PLAN_FAILED',
        message: 'Erro ao confirmar o plano da troca de lote.',
        error: 'Erro ao confirmar o plano da troca de lote.',
        mutation: false,
        execute: false,
      },
      { status: 500 },
    );
  }
}
