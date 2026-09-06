import { NextResponse } from 'next/server';
import {
  loadSaleLotSwapPreview,
  LotSwapPreviewError,
} from '@/lib/finance/saleLotSwapPreviewService';
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
    },
    { status: err.status },
  );
}

async function authorize(request: Request) {
  const { user, configError } = await getRequestAuthUser(request);
  if (configError || !user) {
    return {
      error: NextResponse.json(
        {
          success: false,
          code: 'UNAUTHORIZED',
          message: configError || 'Sessão ou autorização inválida.',
          error: configError || 'Sessão ou autorização inválida.',
          mutation: false,
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
          mutation: false,
        },
        { status: 503 },
      ),
    };
  }
  return { admin, userId: user.id };
}

async function previewResponse(
  request: Request,
  saleId: string,
  toBlockId?: string | null,
) {
  const auth = await authorize(request);
  if ('error' in auth) return auth.error;
  const preview = await loadSaleLotSwapPreview(auth.admin, {
    saleId,
    userId: auth.userId,
    toBlockId,
  });
  return NextResponse.json({ success: true, preview });
}

/** Prévia stateless da Troca de lote. Sem mutação. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ saleId: string }> },
) {
  try {
    const { saleId: raw } = await params;
    const saleId = String(raw || '').trim();
    const toBlockId = new URL(request.url).searchParams.get('toBlockId');
    return await previewResponse(request, saleId, toBlockId);
  } catch (err) {
    if (err instanceof LotSwapPreviewError) return errorResponse(err);
    console.error('[sales/lot-swap GET]', err);
    return NextResponse.json(
      {
        success: false,
        code: 'LOT_SWAP_PREVIEW_FAILED',
        message: 'Erro ao carregar a prévia da troca de lote.',
        error: 'Erro ao carregar a prévia da troca de lote.',
        mutation: false,
      },
      { status: 500 },
    );
  }
}

/** Recalcula a simulação no servidor. Body: { toBlockId }. Sem mutação. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ saleId: string }> },
) {
  try {
    const { saleId: raw } = await params;
    const saleId = String(raw || '').trim();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const toBlockId = body.toBlockId != null ? String(body.toBlockId) : null;
    return await previewResponse(request, saleId, toBlockId);
  } catch (err) {
    if (err instanceof LotSwapPreviewError) return errorResponse(err);
    console.error('[sales/lot-swap POST]', err);
    return NextResponse.json(
      {
        success: false,
        code: 'LOT_SWAP_PREVIEW_FAILED',
        message: 'Erro ao simular a troca de lote.',
        error: 'Erro ao simular a troca de lote.',
        mutation: false,
      },
      { status: 500 },
    );
  }
}
