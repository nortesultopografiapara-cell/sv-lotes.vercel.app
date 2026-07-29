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

async function authorizeRelease(request: Request) {
  const { user, configError } = await getRequestAuthUser(request);
  if (configError || !user) {
    return {
      error: NextResponse.json(
        { error: configError || 'Não autenticado' },
        { status: 401 },
      ),
    };
  }

  const { client: admin, configError: adminError } = createAdminSupabase();
  if (!admin || adminError) {
    return {
      error: NextResponse.json(
        { error: adminError || 'Supabase não configurado' },
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
      return NextResponse.json({ error: 'lotId obrigatório.' }, { status: 400 });
    }

    const auth = await authorizeRelease(request);
    if ('error' in auth) return auth.error;

    const preview = await getReleaseLotPreview(auth.admin, lotId, auth.userId);
    return NextResponse.json({ preview });
  } catch (err) {
    if (err instanceof ReleaseLotError) {
      return NextResponse.json(
        { error: err.message, code: err.code, details: err.details },
        { status: err.status },
      );
    }
    console.error('[lots/release GET]', err);
    return NextResponse.json({ error: 'Erro ao carregar prévia da liberação.' }, { status: 500 });
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
      return NextResponse.json({ error: 'lotId obrigatório.' }, { status: 400 });
    }

    const auth = await authorizeRelease(request);
    if ('error' in auth) return auth.error;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
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

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ReleaseLotError) {
      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
          details: err.details,
        },
        { status: err.status },
      );
    }
    console.error('[lots/release POST]', err);
    return NextResponse.json({ error: 'Erro ao liberar lote.' }, { status: 500 });
  }
}
