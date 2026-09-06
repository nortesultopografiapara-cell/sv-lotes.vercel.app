import { NextResponse } from 'next/server';
import {
  executeSaleLotSwap,
  LotSwapPreviewError,
} from '@/lib/finance/saleLotSwapExecuteService';
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
      persistCharges: false,
    },
    { status: err.status },
  );
}

/** Executa a troca de lote via RPC atômica. Sem Asaas/Inter. */
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
          persistCharges: false,
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
          persistCharges: false,
        },
        { status: 503 },
      );
    }
    const { saleId: raw } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const executed = await executeSaleLotSwap(admin, {
      saleId: String(raw || '').trim(),
      userId: user.id,
      swapId: body.swapId != null ? String(body.swapId) : null,
      idempotencyKey:
        body.idempotencyKey != null ? String(body.idempotencyKey) : null,
      callerRole: 'ADMIN',
    });
    return NextResponse.json({ success: true, executed });
  } catch (err) {
    if (err instanceof LotSwapPreviewError) return errorResponse(err);
    console.error('[sales/lot-swap/execute POST]', err);
    return NextResponse.json(
      {
        success: false,
        code: 'LOT_SWAP_EXECUTE_FAILED',
        message: 'Erro ao executar a troca de lote.',
        error: 'Erro ao executar a troca de lote.',
        mutation: false,
        execute: false,
        persistCharges: false,
      },
      { status: 500 },
    );
  }
}
