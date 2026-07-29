import { NextResponse } from 'next/server';
import {
  executeReleaseLot,
  getReleaseLotPreview,
  ReleaseLotError,
} from '@/lib/finance/releaseLotService';
import { createAdminSupabase, getRequestAuthUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function errorResponse(err: ReleaseLotError) {
  return NextResponse.json(
    {
      success: false,
      code: err.code || 'RELEASE_LOT_FAILED',
      message: err.message || 'Não foi possível liberar o lote.',
      error: err.message,
      stage: err.stage || null,
      details: err.details || null,
    },
    { status: err.status },
  );
}

async function authorizeRelease(request: Request) {
  const { user, configError } = await getRequestAuthUser(request);
  if (configError || !user) {
    return {
      error: NextResponse.json(
        {
          success: false,
          code: 'UNAUTHORIZED',
          message: configError || 'Não autenticado',
          error: configError || 'Não autenticado',
          stage: 'auth',
        },
        { status: 401 },
      ),
    };
  }

  const { client: admin, configError: adminError } = createAdminSupabase();
  if (!admin || adminError) {
    return {
      error: NextResponse.json(
        {
          success: false,
          code: 'SUPABASE_CONFIG',
          message: adminError || 'Supabase não configurado',
          error: adminError || 'Supabase não configurado',
          stage: 'auth',
        },
        { status: 503 },
      ),
    };
  }

  return { admin, userId: user.id };
}

/** Preview do impacto de liberar o lote (somente leitura). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ lotId: string }> },
) {
  try {
    const { lotId: raw } = await params;
    const lotId = String(raw || '').trim();
    if (!lotId) {
      return NextResponse.json(
        {
          success: false,
          code: 'LOT_ID_REQUIRED',
          message: 'lotId obrigatório.',
          error: 'lotId obrigatório.',
          stage: 'load_preview',
        },
        { status: 400 },
      );
    }

    const auth = await authorizeRelease(request);
    if ('error' in auth) return auth.error;

    const preview = await getReleaseLotPreview(auth.admin, lotId, auth.userId);
    return NextResponse.json({ success: true, preview });
  } catch (err) {
    if (err instanceof ReleaseLotError) {
      console.error('[lots/release GET]', err.code, err.stage, err.message);
      return errorResponse(err);
    }
    console.error('[lots/release GET]', err);
    return NextResponse.json(
      {
        success: false,
        code: 'RELEASE_LOT_FAILED',
        message: 'Erro ao carregar prévia da liberação.',
        error: 'Erro ao carregar prévia da liberação.',
        stage: 'load_preview',
      },
      { status: 500 },
    );
  }
}

/**
 * Executa liberação do lote + encerramento seguro da venda.
 * Body: { motiveCode, motiveDetail?, acknowledged: true, idempotencyKey?, retry? }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ lotId: string }> },
) {
  try {
    const { lotId: raw } = await params;
    const lotId = String(raw || '').trim();
    if (!lotId) {
      return NextResponse.json(
        {
          success: false,
          code: 'LOT_ID_REQUIRED',
          message: 'lotId obrigatório.',
          error: 'lotId obrigatório.',
          stage: 'load_preview',
        },
        { status: 400 },
      );
    }

    const auth = await authorizeRelease(request);
    if ('error' in auth) return auth.error;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    console.log('[lots/release POST] start', {
      lotId: lotId.slice(0, 8),
      motiveCode: body.motiveCode,
      userId: auth.userId.slice(0, 8),
    });

    const result = await executeReleaseLot(auth.admin, {
      lotId,
      userId: auth.userId,
      motiveCode: String(body.motiveCode || ''),
      motiveDetail: body.motiveDetail != null ? String(body.motiveDetail) : null,
      acknowledged: body.acknowledged === true,
      idempotencyKey:
        body.idempotencyKey != null ? String(body.idempotencyKey) : null,
      retry: body.retry === true,
    });

    console.log('[lots/release POST] ok', {
      lotId: result.lotId.slice(0, 8),
      saleId: result.saleId?.slice(0, 8),
      alreadyReleased: result.alreadyReleased,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ReleaseLotError) {
      console.error('[lots/release POST]', err.code, err.stage, err.message, err.details);
      return errorResponse(err);
    }
    console.error('[lots/release POST]', err);
    return NextResponse.json(
      {
        success: false,
        code: 'RELEASE_LOT_FAILED',
        message: 'Não foi possível liberar o lote.',
        error: 'Não foi possível liberar o lote.',
        stage: null,
      },
      { status: 500 },
    );
  }
}
