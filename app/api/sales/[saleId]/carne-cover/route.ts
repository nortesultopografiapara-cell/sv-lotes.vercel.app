import { NextResponse } from 'next/server';
import {
  buildSaleCarneCoverFilename,
  buildSaleCarneCoverPdfBytes,
} from '@/lib/finance/saleCarneCoverPdf';
import {
  getSaleCarneCoverSummary,
  resolveCoverLogoDataUrl,
  SaleCarneCoverError,
} from '@/lib/finance/saleCarneCoverService';
import { assertSaleDocumentSaleAccess, SaleDocumentError } from '@/lib/saleDocumentService';
import { createAdminSupabase, getRequestAuthUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function authorizeCover(
  request: Request,
  saleId: string,
): Promise<
  | { error: NextResponse }
  | { admin: NonNullable<ReturnType<typeof createAdminSupabase>['client']>; companyId: string; userId: string }
> {
  const { user, configError } = await getRequestAuthUser(request);
  if (configError || !user) {
    return { error: NextResponse.json({ error: configError || 'Não autenticado' }, { status: 401 }) };
  }

  const { client: admin, configError: adminError } = createAdminSupabase();
  if (!admin || adminError) {
    return {
      error: NextResponse.json({ error: adminError || 'Supabase não configurado' }, { status: 503 }),
    };
  }

  try {
    const ctx = await assertSaleDocumentSaleAccess(admin, saleId, user.id);
    return { admin, companyId: ctx.companyId, userId: user.id };
  } catch (err) {
    if (err instanceof SaleDocumentError) {
      return { error: NextResponse.json({ error: err.message }, { status: err.status }) };
    }
    throw err;
  }
}

/** Resumo somente leitura para a aba Capa do Carnê. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ saleId: string }> },
) {
  try {
    const { saleId: rawSaleId } = await params;
    const saleId = String(rawSaleId || '').trim();
    if (!saleId) {
      return NextResponse.json({ error: 'saleId obrigatório.' }, { status: 400 });
    }

    const auth = await authorizeCover(request, saleId);
    if ('error' in auth) return auth.error;

    const summary = await getSaleCarneCoverSummary(auth.admin, auth.companyId, saleId);
    return NextResponse.json({ summary });
  } catch (err) {
    if (err instanceof SaleCarneCoverError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales/carne-cover GET]', err);
    return NextResponse.json({ error: 'Erro ao carregar capa do carnê.' }, { status: 500 });
  }
}

/**
 * Gera o PDF da capa (somente leitura — não altera venda/parcelas/cobranças).
 * Body opcional: {} — saleId vem da URL.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ saleId: string }> },
) {
  try {
    const { saleId: rawSaleId } = await params;
    const saleId = String(rawSaleId || '').trim();
    if (!saleId) {
      return NextResponse.json({ error: 'saleId obrigatório.' }, { status: 400 });
    }

    const auth = await authorizeCover(request, saleId);
    if ('error' in auth) return auth.error;

    const summary = await getSaleCarneCoverSummary(auth.admin, auth.companyId, saleId);
    if (!summary.canGenerate) {
      return NextResponse.json(
        { error: summary.statusMessage, summary },
        { status: 409 },
      );
    }

    const logoDataUrl = await resolveCoverLogoDataUrl(summary.company.logoUrl);

    const pdfBytes = await buildSaleCarneCoverPdfBytes({
      customerName: String(summary.customerName || 'Cliente'),
      projectName: String(summary.projectName || 'Empreendimento'),
      quadra: String(summary.quadra || '—'),
      lote: String(summary.lote || '—'),
      installmentsCount: summary.installmentsCount,
      companyLegalName: summary.company.legalName,
      companyDocumentFormatted: summary.company.documentFormatted,
      companyPhoneFormatted: summary.company.phoneFormatted,
      companyEmail: summary.company.email,
      logoDataUrl,
      portalUrl: summary.portalUrl,
      portalDisplayUrl: summary.portalDisplayUrl,
    });

    const filename = buildSaleCarneCoverFilename({
      customerName: summary.customerName,
      quadra: summary.quadra,
      lote: summary.lote,
    });

    console.log('SALE_CARNE_COVER_PDF_OK', {
      saleId,
      companyId: auth.companyId,
      userId: auth.userId,
      installmentsCount: summary.installmentsCount,
      bytes: pdfBytes.byteLength,
    });

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'X-SV-Document-Type': 'COVER_BOOKLET',
      },
    });
  } catch (err) {
    if (err instanceof SaleCarneCoverError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales/carne-cover POST]', err);
    return NextResponse.json({ error: 'Erro ao gerar capa do carnê.' }, { status: 500 });
  }
}
