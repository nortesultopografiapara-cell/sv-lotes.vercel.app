import { NextResponse } from 'next/server';
import {
  loadSaleTitleTransferPreview,
  TitleTransferPreviewError,
} from '@/lib/finance/saleTitleTransferPreviewService';
import { createAdminSupabase, getRequestAuthUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * P2 — prévia somente leitura da Transferência de titularidade.
 * GET. Sem mutação. Sem RPC. Sem cancelamento bancário.
 */

function errorResponse(err: TitleTransferPreviewError) {
  return NextResponse.json(
    {
      success: false,
      code: err.code,
      message: err.message,
      error: err.message,
      mutation: false,
      persistTransfer: false,
      cancelCharges: false,
      generateCharges: false,
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ saleId: string }> },
) {
  try {
    const { saleId: raw } = await params;
    const saleId = String(raw || '').trim();
    if (!saleId) {
      return NextResponse.json(
        {
          success: false,
          code: 'SALE_ID_REQUIRED',
          message: 'saleId obrigatório.',
          mutation: false,
        },
        { status: 400 },
      );
    }
    const auth = await authorize(request);
    if ('error' in auth) return auth.error;
    const preview = await loadSaleTitleTransferPreview(auth.admin, {
      saleId,
      userId: auth.userId,
    });
    return NextResponse.json({
      success: true,
      mutation: false,
      preview,
    });
  } catch (err) {
    if (err instanceof TitleTransferPreviewError) return errorResponse(err);
    const message = err instanceof Error ? err.message : 'Erro ao carregar a prévia.';
    return NextResponse.json(
      {
        success: false,
        code: 'LOAD_FAILED',
        message,
        error: message,
        mutation: false,
      },
      { status: 500 },
    );
  }
}
