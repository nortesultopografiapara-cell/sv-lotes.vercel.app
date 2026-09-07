import { NextResponse } from 'next/server';
import { prepareTitleTransferPlanPreview } from '@/lib/finance/saleTitleTransferPlanService';
import { TitleTransferPreviewError } from '@/lib/finance/saleTitleTransferPreviewService';
import { createAdminSupabase, getRequestAuthUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * P3 — preview A → B da Transferência de titularidade.
 * POST de validação. mutation: false. Não persiste. Não executa.
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
      persistSale: false,
      persistLot: false,
      persistContract: false,
      persistReceipts: false,
      persistCharges: false,
      cancelCharges: false,
      generateCharges: false,
    },
    { status: err.status },
  );
}

export async function POST(
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
    const body = (await request.json().catch(() => ({}))) as {
      toCustomerId?: string | null;
      transferDate?: string | null;
      declaredAgioAmount?: string | number | null;
      notes?: string | null;
      expectedContractId?: string | null;
      expectedBlockId?: string | null;
      persistTransfer?: boolean;
      execute?: boolean;
    };
    if (body.persistTransfer === true || body.execute === true) {
      return NextResponse.json(
        {
          success: false,
          code: 'TITLE_TRANSFER_EXECUTE_DISABLED',
          message: 'A execução da transferência não está disponível nesta etapa.',
          mutation: false,
          persistTransfer: false,
        },
        { status: 409 },
      );
    }
    const plan = await prepareTitleTransferPlanPreview(admin, {
      saleId,
      userId: user.id,
      toCustomerId: body.toCustomerId,
      transferDate: body.transferDate,
      declaredAgioAmount: body.declaredAgioAmount,
      notes: body.notes,
      expectedContractId: body.expectedContractId,
      expectedBlockId: body.expectedBlockId,
    });
    return NextResponse.json({
      success: true,
      mutation: false,
      persistTransfer: false,
      plan,
    });
  } catch (err) {
    if (err instanceof TitleTransferPreviewError) return errorResponse(err);
    const message = err instanceof Error ? err.message : 'Erro ao montar o preview da transferência.';
    return NextResponse.json(
      { success: false, code: 'PLAN_FAILED', message, error: message, mutation: false },
      { status: 500 },
    );
  }
}
