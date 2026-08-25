import { NextResponse } from 'next/server';
import { SaleDocumentError } from '@/lib/saleDocumentService';
import { createAdminSupabase, getRequestAuthUser } from '@/lib/supabase/server';
import { assertSaleDocumentSaleAccess } from '@/lib/saleDocumentService';
import { SaleContractSignatureError } from '@/lib/saleContractSignatureErrors';
import {
  getTerminationSignatureView,
  sendTerminationDocumentForSignature,
} from '@/lib/termination-documents/signature';
import { TerminationDocumentError } from '@/lib/termination-documents/persist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function authorize(request: Request, saleId: string) {
  const { user, configError } = await getRequestAuthUser(request);
  if (configError || !user) {
    return {
      error: NextResponse.json(
        { success: false, error: configError || 'Não autenticado' },
        { status: 401 },
      ),
    };
  }
  const { client: admin, configError: adminError } = createAdminSupabase();
  if (!admin || adminError) {
    return {
      error: NextResponse.json(
        { success: false, error: adminError || 'Supabase não configurado' },
        { status: 503 },
      ),
    };
  }
  const ctx = await assertSaleDocumentSaleAccess(admin, saleId, user.id);
  return { admin, userId: user.id, companyId: ctx.companyId };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ saleId: string }> },
) {
  try {
    const { saleId: raw } = await params;
    const saleId = String(raw || '').trim();
    if (!saleId) {
      return NextResponse.json({ success: false, error: 'saleId obrigatório.' }, { status: 400 });
    }
    const auth = await authorize(request, saleId);
    if ('error' in auth) return auth.error;
    const view = await getTerminationSignatureView(auth.admin, {
      saleId,
      companyId: auth.companyId,
    });
    return NextResponse.json({ success: true, ...view });
  } catch (err) {
    if (err instanceof SaleDocumentError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    console.error('[termination-document signature GET]', err);
    return NextResponse.json({ success: false, error: 'Erro ao carregar assinatura do termo.' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ saleId: string }> },
) {
  try {
    const { saleId: raw } = await params;
    const saleId = String(raw || '').trim();
    if (!saleId) {
      return NextResponse.json({ success: false, error: 'saleId obrigatório.' }, { status: 400 });
    }
    const auth = await authorize(request, saleId);
    if ('error' in auth) return auth.error;

    const sent = await sendTerminationDocumentForSignature(auth.admin, {
      saleId,
      companyId: auth.companyId,
      operatorUserId: auth.userId,
    });
    const view = await getTerminationSignatureView(auth.admin, {
      saleId,
      companyId: auth.companyId,
    });
    return NextResponse.json({
      success: true,
      signUrl: sent.signUrl,
      documentNumber: sent.documentNumber,
      title: sent.title,
      ...view,
    });
  } catch (err) {
    if (err instanceof TerminationDocumentError) {
      return NextResponse.json(
        { success: false, error: err.message, code: err.code },
        { status: 409 },
      );
    }
    if (err instanceof SaleContractSignatureError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    if (err instanceof SaleDocumentError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    console.error('[termination-document signature POST]', err);
    return NextResponse.json(
      { success: false, error: 'Erro ao enviar o termo para assinatura.' },
      { status: 500 },
    );
  }
}
