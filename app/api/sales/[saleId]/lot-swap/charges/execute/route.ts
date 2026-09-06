import { NextResponse } from 'next/server';
import {
  executeSaleLotSwapWithExternalCharges,
  LotSwapChargesPhaseError,
  LotSwapPreviewError,
} from '@/lib/finance/saleLotSwapChargesExecuteService';
import { createAdminSupabase, getRequestAuthUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Fase 5B — cancela cobranças externas canceláveis, executa a Fase 4 e gera faltantes.
 * Sem if de banco nesta rota. Live default off: sem chamada Asaas/Inter real.
 */
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
    const result = await executeSaleLotSwapWithExternalCharges(admin, {
      saleId: String(raw || '').trim(),
      userId: user.id,
      swapId: body.swapId != null ? String(body.swapId) : null,
      idempotencyKey:
        body.idempotencyKey != null ? String(body.idempotencyKey) : null,
      callerRole: 'ADMIN',
    });
    return NextResponse.json({
      success: true,
      executed: result.local,
      charges: result,
    });
  } catch (err) {
    if (err instanceof LotSwapChargesPhaseError) {
      return NextResponse.json(
        {
          success: false,
          code: err.code,
          message: err.message,
          error: err.message,
          mutation: true,
          execute: Boolean(err.local),
          persistCharges: true,
          executed: err.local || null,
          chargesPhase: err.chargesPhase,
          remoteApiCalled: err.remoteApiCalled,
        },
        { status: err.status },
      );
    }
    if (err instanceof LotSwapPreviewError) {
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
    console.error('[sales/lot-swap/charges/execute POST]', err);
    return NextResponse.json(
      {
        success: false,
        code: 'LOT_SWAP_CHARGES_EXECUTE_FAILED',
        message: 'Erro ao tratar cobranças externas da troca de lote.',
        error: 'Erro ao tratar cobranças externas da troca de lote.',
        mutation: false,
        execute: false,
        persistCharges: false,
      },
      { status: 500 },
    );
  }
}
