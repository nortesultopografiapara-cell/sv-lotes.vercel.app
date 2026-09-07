import { NextResponse } from 'next/server';
import {
  searchTitleTransferCustomers,
} from '@/lib/finance/saleTitleTransferPlanService';
import { TitleTransferPreviewError } from '@/lib/finance/saleTitleTransferPreviewService';
import { createAdminSupabase, getRequestAuthUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * P3 — busca de clientes da mesma empresa para cessionário.
 * GET. Sem cadastro. Sem mutação.
 */

function errorResponse(err: TitleTransferPreviewError) {
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ saleId: string }> },
) {
  try {
    const { saleId: raw } = await params;
    const saleId = String(raw || '').trim();
    if (!saleId) {
      return NextResponse.json(
        { success: false, code: 'SALE_ID_REQUIRED', message: 'saleId obrigatório.', mutation: false },
        { status: 400 },
      );
    }
    const { user, configError } = await getRequestAuthUser(request);
    if (configError || !user) {
      return NextResponse.json(
        {
          success: false,
          code: 'UNAUTHORIZED',
          message: configError || 'Sessão ou autorização inválida.',
          mutation: false,
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
          mutation: false,
        },
        { status: 503 },
      );
    }
    const url = new URL(request.url);
    const query = String(url.searchParams.get('q') || url.searchParams.get('query') || '').trim();
    const result = await searchTitleTransferCustomers(admin, {
      saleId,
      userId: user.id,
      query,
    });
    return NextResponse.json({
      success: true,
      mutation: false,
      persistTransfer: false,
      customers: result.customers,
    });
  } catch (err) {
    if (err instanceof TitleTransferPreviewError) return errorResponse(err);
    const message = err instanceof Error ? err.message : 'Erro ao buscar clientes.';
    return NextResponse.json(
      { success: false, code: 'SEARCH_FAILED', message, error: message, mutation: false },
      { status: 500 },
    );
  }
}
