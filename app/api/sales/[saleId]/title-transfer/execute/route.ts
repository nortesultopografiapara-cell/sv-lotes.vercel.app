import { NextResponse } from 'next/server';
import { executeSaleTitleTransferWithExternalCharges } from '@/lib/finance/saleTitleTransferChargesExecuteService';
import { TitleTransferPreviewError } from '@/lib/finance/saleTitleTransferPreviewService';
import { createAdminSupabase, getRequestAuthUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * P4 — execução da Transferência de titularidade.
 * Cancela cobranças abertas do titular A (registry) e só então chama a RPC local.
 * Não gera boleto/Pix. Não chama /release. Não reusa a RPC da Troca.
 */

function errorResponse(err: TitleTransferPreviewError) {
  return NextResponse.json(
    {
      success: false,
      code: err.code,
      message: err.message,
      error: err.message,
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
    const body = (await request.json().catch(() => ({}))) as {
      toCustomerId?: string;
      transferDate?: string | null;
      declaredAgioAmount?: string | number | null;
      notes?: string | null;
      expectedContractId?: string | null;
      expectedFromCustomerId?: string | null;
      expectedBlockId?: string | null;
      confirmTransfer?: boolean;
      idempotencyKey?: string | null;
      generateCharges?: boolean;
    };
    if (body.generateCharges === true) {
      return NextResponse.json(
        {
          success: false,
          code: 'TITLE_TRANSFER_GENERATE_DISABLED',
          message: 'A transferência não gera boleto ou Pix. Use Editar venda → Cobranças.',
          generateCharges: false,
        },
        { status: 409 },
      );
    }
    const executed = await executeSaleTitleTransferWithExternalCharges(admin, {
      saleId,
      userId: user.id,
      toCustomerId: String(body.toCustomerId || ''),
      transferDate: body.transferDate,
      declaredAgioAmount: body.declaredAgioAmount,
      notes: body.notes,
      expectedContractId: body.expectedContractId,
      expectedFromCustomerId: body.expectedFromCustomerId,
      expectedBlockId: body.expectedBlockId,
      confirmTransfer: body.confirmTransfer === true,
      idempotencyKey: body.idempotencyKey,
    });
    return NextResponse.json({
      success: true,
      generateCharges: false,
      executed,
    });
  } catch (err) {
    if (err instanceof TitleTransferPreviewError) return errorResponse(err);
    const message = err instanceof Error ? err.message : 'Erro ao executar a transferência.';
    return NextResponse.json(
      { success: false, code: 'EXECUTE_FAILED', message, error: message, generateCharges: false },
      { status: 500 },
    );
  }
}
