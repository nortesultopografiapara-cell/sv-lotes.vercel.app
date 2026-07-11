import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIAG_TOKEN = 'sv-lotes-diag-062-063-20260711';
const CONTRACTS = ['000000062/2026', '000000063/2026'] as const;

type ReceiptRow = {
  id: string;
  installment_number: number | string | null;
  due_date: string | null;
  amount: number | null;
  status: string | null;
  sale_id: string | null;
  company_id: string | null;
  tenant_id: string | null;
};

async function loadAllReceiptsForSale(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  saleId: string,
): Promise<ReceiptRow[]> {
  const all: ReceiptRow[] = [];
  let from = 0;
  const page = 100;
  for (;;) {
    const { data: chunk, error: re } = await sb
      .from('finance_receipts')
      .select(
        'id,installment_number,due_date,amount,status,sale_id,company_id,tenant_id',
      )
      .eq('sale_id', saleId)
      .order('installment_number', { ascending: true })
      .range(from, from + page - 1);
    if (re) throw new Error(`finance_receipts page: ${re.message || JSON.stringify(re)}`);
    if (!chunk?.length) break;
    all.push(...(chunk as ReceiptRow[]));
    if (chunk.length < page) break;
    from += page;
  }
  return all;
}

function summarizeReceipts(
  sale: Record<string, unknown> | null,
  all: ReceiptRow[],
) {
  const numbers = all
    .map((r) => Number(r.installment_number))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  const dueDates = all
    .map((r) => String(r.due_date || '').split('T')[0])
    .filter(Boolean)
    .sort();

  const byNum = new Map<number, number>();
  for (const n of numbers) byNum.set(n, (byNum.get(n) || 0) + 1);
  const duplicates = [...byNum.entries()]
    .filter(([, c]) => c > 1)
    .map(([n, c]) => ({ installment_number: n, count: c }));

  const expected = Math.max(1, Number(sale?.installments_count) || 0);
  const monthly = numbers.filter((n) => n >= 1);
  const missing: number[] = [];
  for (let i = 1; i <= expected; i++) {
    if (!monthly.includes(i)) missing.push(i);
  }

  const statusCounts = all.reduce(
    (acc, r) => {
      const st = String(r.status || 'null');
      acc[st] = (acc[st] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return {
    receiptsLoaded: all.length,
    installmentNumbers: numbers,
    minMaxInstallment: {
      min: numbers[0] ?? null,
      max: numbers[numbers.length - 1] ?? null,
    },
    minMaxDue: {
      min: dueDates[0] ?? null,
      max: dueDates[dueDates.length - 1] ?? null,
    },
    duplicatesByInstallmentNumber: duplicates,
    expectedInstallments: expected,
    missingNumbers: missing,
    statusCounts,
    statusByInstallment: all.map((r) => ({
      n: r.installment_number,
      due: r.due_date,
      amount: r.amount,
      status: r.status,
    })),
  };
}

/**
 * Diagnóstico somente leitura — contratos 000000062/2026 e 000000063/2026.
 * Rota sob /api/cron (middleware público); bloqueada em production; exige x-diag-token.
 */
export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const token = request.headers.get('x-diag-token');
  if (token !== DIAG_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { client: sb, error: configError } = createServiceSupabase();
  if (!sb || configError) {
    return NextResponse.json(
      { error: configError || 'Service role não configurada.' },
      { status: 503 },
    );
  }

  try {
    let menesesCompanyId: string | null = null;
    const contracts: Array<Record<string, unknown>> = [];

    for (const contractNumber of CONTRACTS) {
      const { data: contractRows, error: ce } = await sb
        .from('contracts')
        .select(
          'id,contract_number,sale_id,company_id,tenant_id,version,is_current,status,customer_id',
        )
        .eq('contract_number', contractNumber)
        .order('version', { ascending: false });
      if (ce) throw new Error(`contracts query: ${ce.message || JSON.stringify(ce)}`);

      const current =
        (contractRows || []).find((c) => c.is_current) || (contractRows || [])[0];
      if (!current) {
        contracts.push({ contractNumber, found: false });
        continue;
      }

      const saleId = String(current.sale_id);
      const { data: sale, error: se } = await sb
        .from('sales')
        .select(
          'id,company_id,tenant_id,payment_type,installments_count,installment_value,lot_price,agreed_price,total_value,final_value,down_payment,discount,down_payment_due_date,first_installment_due_date,sale_date,customer_id',
        )
        .eq('id', saleId)
        .maybeSingle();
      if (se) throw new Error(`sales query: ${se.message || JSON.stringify(se)}`);

      menesesCompanyId = String(sale?.company_id || current.company_id || '');

      const { count, error: countErr } = await sb
        .from('finance_receipts')
        .select('id', { count: 'exact', head: true })
        .eq('sale_id', saleId);
      if (countErr) {
        throw new Error(
          `finance_receipts count: ${countErr.message || JSON.stringify(countErr)}`,
        );
      }

      const all = await loadAllReceiptsForSale(sb, saleId);
      const summary = summarizeReceipts(sale as Record<string, unknown> | null, all);

      let orphanReceiptsSameCustomerNullSale: number | null = null;
      if (sale?.customer_id) {
        const { count: orphanCount } = await sb
          .from('finance_receipts')
          .select('id', { count: 'exact', head: true })
          .eq('customer_id', sale.customer_id)
          .is('sale_id', null);
        orphanReceiptsSameCustomerNullSale = orphanCount ?? null;
      }

      contracts.push({
        contractNumber,
        found: true,
        contract: {
          id: current.id,
          version: current.version,
          is_current: current.is_current,
          sale_id: current.sale_id,
          company_id: current.company_id,
          tenant_id: current.tenant_id,
          status: current.status,
        },
        sale: {
          id: sale?.id,
          company_id: sale?.company_id,
          tenant_id: sale?.tenant_id,
          payment_type: sale?.payment_type,
          installments_count: sale?.installments_count,
          installment_value: sale?.installment_value,
          lot_price: sale?.lot_price,
          agreed_price: sale?.agreed_price,
          total_value: sale?.total_value,
          final_value: sale?.final_value,
          down_payment: sale?.down_payment,
          discount: sale?.discount,
          down_payment_due_date: sale?.down_payment_due_date,
          first_installment_due_date: sale?.first_installment_due_date,
          sale_date: sale?.sale_date,
        },
        receiptsCountExact: count,
        ...summary,
        orphanReceiptsSameCustomerNullSale,
      });
    }

    let postgrestTruncationProbe: Record<string, unknown> | null = null;
    if (menesesCompanyId) {
      const { count: tenantExact } = await sb
        .from('finance_receipts')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', menesesCompanyId);

      const { data: unpaged, error: upErr } = await sb
        .from('finance_receipts')
        .select('id,sale_id,installment_number,due_date')
        .eq('company_id', menesesCompanyId)
        .order('due_date', { ascending: true });

      const unpagedLen = unpaged?.length ?? 0;
      postgrestTruncationProbe = {
        company_id: menesesCompanyId,
        tenantReceiptsCountExact: tenantExact,
        unpagedError: upErr?.message ?? null,
        unpagedReturnedRows: unpagedLen,
        truncated: tenantExact != null && unpagedLen < tenantExact,
        missing:
          tenantExact != null ? tenantExact - unpagedLen : null,
      };
    }

    return NextResponse.json({
      ok: true,
      readOnly: true,
      contracts,
      postgrestTruncationProbe,
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === 'object' && err && 'message' in err
          ? String((err as { message?: unknown }).message)
          : JSON.stringify(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
