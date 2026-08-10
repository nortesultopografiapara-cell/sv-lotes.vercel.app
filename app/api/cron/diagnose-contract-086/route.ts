/**
 * Read-only: prévia Cláusula Terceira do contrato 000000086/2026 com dados reais.
 * Header: x-diag-token: sv-lotes-diag-meneses-086
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import { generateContractHTML } from '@/lib/contractTemplate';
import { resolveContractPaymentDates } from '@/lib/contractPaymentDates';
import { resolveSaleContractPaymentBreakdown } from '@/lib/saleContractPaymentSummary';
import { resolveSaleContractModel } from '@/lib/contractModel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIAG_TOKEN = 'sv-lotes-diag-meneses-086';
const CONTRACT_NUMBER = '000000086/2026';

function stripHtml(s: string) {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/\u00a0|\u202f/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTerceira(html: string) {
  const m = html.match(
    /Cláusula Terceira — Do Preço e da Forma de Pagamento:<\/strong>\s*([\s\S]*?)<\/p>/i,
  );
  return m ? stripHtml(m[1]) : '';
}

function extractQuadroRows(html: string) {
  const block = html.match(/Quadro resumo[\s\S]*?<table[\s\S]*?<\/table>/i)?.[0];
  if (!block) return [] as Array<{ label: string; value: string }>;
  const rows: Array<{ label: string; value: string }> = [];
  const re =
    /<tr>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    rows.push({ label: stripHtml(m[1]), value: stripHtml(m[2]) });
  }
  return rows;
}

export async function GET(request: NextRequest) {
  const token = request.headers.get('x-diag-token');
  if (token !== DIAG_TOKEN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { client: sb, error: configError } = createServiceSupabase();
  if (!sb || configError) {
    return NextResponse.json(
      { error: configError || 'supabase_unavailable' },
      { status: 503 },
    );
  }

  const { data: contracts, error: cErr } = await sb
    .from('contracts')
    .select(
      'id, contract_number, sale_id, project_id, block_id, customer_id, tenant_id, company_id, status, version, is_current',
    )
    .eq('contract_number', CONTRACT_NUMBER)
    .order('version', { ascending: false })
    .limit(10);

  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }
  if (!contracts?.length) {
    return NextResponse.json({ error: 'contract_not_found' }, { status: 404 });
  }

  const current =
    contracts.find((c) => c.is_current === true) || contracts[0];
  const saleId = String(current.sale_id || '');
  if (!saleId) {
    return NextResponse.json({ error: 'missing_sale_id' }, { status: 404 });
  }

  const [
    { data: sale, error: sErr },
    { data: receipts, error: rErr },
    companyRes,
    customerRes,
    projectRes,
    blockRes,
  ] = await Promise.all([
    sb.from('sales').select('*').eq('id', saleId).maybeSingle(),
    sb
      .from('finance_receipts')
      .select('id, installment_number, amount, due_date, status, sale_id')
      .eq('sale_id', saleId)
      .order('installment_number', { ascending: true }),
    current.tenant_id || current.company_id
      ? sb
          .from('companies')
          .select('*')
          .eq('id', current.tenant_id || current.company_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    current.customer_id
      ? sb.from('customers').select('*').eq('id', current.customer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    current.project_id
      ? sb.from('projects').select('*').eq('id', current.project_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    current.block_id
      ? sb.from('blocks').select('*').eq('id', current.block_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (sErr || !sale) {
    return NextResponse.json(
      { error: sErr?.message || 'sale_not_found' },
      { status: 404 },
    );
  }
  if (rErr) {
    return NextResponse.json({ error: rErr.message }, { status: 500 });
  }

  let balloonAddons:
    | Array<{ installment_number: number; additional_amount: number }>
    | undefined;
  const { data: balloons, error: bErr } = await sb
    .from('sale_balloon_installments')
    .select('installment_number, additional_amount')
    .eq('sale_id', saleId);
  if (!bErr && balloons?.length) {
    balloonAddons = balloons as Array<{
      installment_number: number;
      additional_amount: number;
    }>;
  }

  const company = companyRes.data;
  const tenant = {
    ...(company || {}),
    contract_model:
      (company as { contract_model?: string } | null)?.contract_model || 'MENESES',
  };
  const model = resolveSaleContractModel(tenant);
  const dates = resolveContractPaymentDates(
    sale as Record<string, unknown>,
    receipts || [],
  );
  const breakdown = resolveSaleContractPaymentBreakdown(
    sale as Record<string, unknown>,
    {
      financeReceipts: receipts || [],
      balloonAddons,
      contractModel: model,
    },
  );

  const html = generateContractHTML({
    tenant,
    customer: customerRes.data || { name: 'Cliente' },
    project: projectRes.data || { name: 'Empreendimento' },
    block: blockRes.data || {},
    sale: sale as Record<string, unknown>,
    financeReceipts: (receipts || []) as any,
    balloonAddons,
  });

  const terceira = extractTerceira(html);
  const quadro = extractQuadroRows(html);

  const parcelRecs = (receipts || [])
    .filter((r) => Number(r.installment_number) >= 1)
    .sort(
      (a, b) =>
        Number(a.installment_number) - Number(b.installment_number) ||
        String(a.due_date).localeCompare(String(b.due_date)),
    );

  const norm = (s: string) => stripHtml(s);
  const coherence = {
    totalInTerceira: terceira.includes(
      norm(breakdown.netValueFmt || breakdown.lotPriceFmt),
    ),
    entryInTerceira: terceira.includes(norm(breakdown.entryFmt)),
    saldoInTerceira: terceira.includes(norm(breakdown.installmentBalanceFmt)),
    qtdInTerceira: terceira.includes(String(breakdown.installmentsCount)),
    parcelaInTerceira: terceira.includes(norm(breakdown.installmentValueFmt)),
    firstDueInTerceira: terceira.includes(dates.firstInstallmentDueFmt),
    lastDueInTerceira: terceira.includes(dates.lastInstallmentDueFmt),
    quadroHasTotal: quadro.some((r) =>
      norm(r.value).includes(norm(breakdown.lotPriceFmt)),
    ),
    quadroHasEntry: quadro.some((r) =>
      norm(r.value).includes(norm(breakdown.entryFmt)),
    ),
    quadroHasSaldo: quadro.some((r) =>
      norm(r.value).includes(norm(breakdown.installmentBalanceFmt)),
    ),
    quadroHasParcela: quadro.some((r) =>
      norm(r.value).includes(norm(breakdown.installmentValueFmt)),
    ),
  };

  return NextResponse.json({
    ok: true,
    contractNumber: CONTRACT_NUMBER,
    contractId: current.id,
    saleId,
    model,
    saleSnapshot: {
      payment_type: sale.payment_type,
      lot_price: sale.lot_price,
      total_value: sale.total_value,
      agreed_price: sale.agreed_price,
      down_payment: sale.down_payment,
      installments_count: sale.installments_count,
      installment_value: sale.installment_value,
      first_installment_due_date: sale.first_installment_due_date,
      discount: sale.discount,
    },
    receiptsCount: (receipts || []).length,
    parcelCount: parcelRecs.length,
    firstReceipt: parcelRecs[0]
      ? {
          n: parcelRecs[0].installment_number,
          amount: parcelRecs[0].amount,
          due_date: parcelRecs[0].due_date,
        }
      : null,
    lastReceipt: parcelRecs[parcelRecs.length - 1]
      ? {
          n: parcelRecs[parcelRecs.length - 1].installment_number,
          amount: parcelRecs[parcelRecs.length - 1].amount,
          due_date: parcelRecs[parcelRecs.length - 1].due_date,
        }
      : null,
    paymentDates: {
      firstInstallmentDueFmt: dates.firstInstallmentDueFmt,
      lastInstallmentDueFmt: dates.lastInstallmentDueFmt,
      firstInstallmentDueRaw: dates.firstInstallmentDueRaw,
      lastInstallmentDueRaw: dates.lastInstallmentDueRaw,
    },
    breakdown: {
      lotPriceFmt: breakdown.lotPriceFmt,
      entryFmt: breakdown.entryFmt,
      installmentBalanceFmt: breakdown.installmentBalanceFmt,
      installmentsCount: breakdown.installmentsCount,
      installmentValueFmt: breakdown.installmentValueFmt,
      netValueFmt: breakdown.netValueFmt,
      paymentMode: breakdown.paymentMode,
    },
    terceira,
    quadro,
    coherence,
    allCoherent: Object.values(coherence).every(Boolean),
  });
}
