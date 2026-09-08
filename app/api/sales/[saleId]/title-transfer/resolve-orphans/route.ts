import { NextResponse } from 'next/server';
import { resolveSaleTitleTransferOrphanCharges } from '@/lib/finance/saleTitleTransferOrphanChargesService';
import { TitleTransferPreviewError } from '@/lib/finance/saleTitleTransferPreviewService';
import { createAdminSupabase, getRequestAuthUser } from '@/lib/supabase/server';
import { isProductionSupabaseRuntime } from '@/lib/homolog/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Resolve órfãs Inter da Transferência. Não executa a RPC.
 * DEVELOP/Preview somente.
 */

function errorResponse(err: TitleTransferPreviewError) {
  return NextResponse.json(
    {
      success: false,
      code: err.code,
      message: err.message,
      error: err.message,
      executeTransfer: false,
      generateCharges: false,
    },
    { status: err.status },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ saleId: string }> },
) {
  if (String(process.env.VERCEL_ENV || '').toLowerCase() === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (isProductionSupabaseRuntime()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const { saleId: raw } = await params;
    const saleId = String(raw || '').trim();
    if (!saleId) {
      return NextResponse.json(
        { success: false, code: 'SALE_ID_REQUIRED', message: 'saleId obrigatório.' },
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
        },
        { status: 503 },
      );
    }
    const resolved = await resolveSaleTitleTransferOrphanCharges(admin, {
      saleId,
      userId: user.id,
    });
    return NextResponse.json(
      {
        success: resolved.ok,
        executeTransfer: false,
        persistReceipts: false,
        persistSale: false,
        generateCharges: false,
        resolvedChargeIds: resolved.resolvedChargeIds,
        remainingOrphanIds: resolved.remainingOrphanIds,
        remainingOrphans: resolved.remainingOrphans.length,
        items: resolved.items,
      },
      { status: resolved.ok ? 200 : 409 },
    );
  } catch (err) {
    if (err instanceof TitleTransferPreviewError) return errorResponse(err);
    const message = err instanceof Error ? err.message : 'Falha ao resolver cobranças órfãs.';
    return NextResponse.json(
      {
        success: false,
        code: 'TITLE_TRANSFER_ORPHAN_RESOLVE_FAILED',
        message,
        error: message,
        executeTransfer: false,
      },
      { status: 500 },
    );
  }
}
