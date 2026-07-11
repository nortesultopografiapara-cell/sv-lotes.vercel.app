/**
 * Auditoria read-only de contratos potencialmente defeituosos (versão zerada).
 * Não repara nada — apenas agrega contagens por empresa/modelo.
 *
 * Rota sob /api/cron (middleware público); bloqueada em production; exige x-diag-token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIAG_TOKEN = 'sv-lotes-audit-contracts-zero-20260711';

type ContractAuditRow = {
  id: string;
  contract_number: string | null;
  tenant_id: string | null;
  company_id: string | null;
  sale_id: string | null;
  sale_value: number | null;
  version: number | null;
  status: string | null;
  is_current: boolean | null;
  generated_html: string | null;
  project_name_snapshot: string | null;
};

type SaleLite = {
  id: string;
  total_value: number | null;
  agreed_price: number | null;
  payment_type: string | null;
  block_id: string | null;
};

type CompanyLite = {
  id: string;
  name: string | null;
  contract_model: string | null;
};

function htmlLooksZeroed(html: string | null | undefined): boolean {
  if (!html) return true;
  const h = html;
  const hasZero = /R\$\s*0,00/.test(h);
  const hasPositive = /R\$\s*[1-9]/.test(h);
  return hasZero && !hasPositive;
}

function htmlMissingLot(html: string | null | undefined): boolean {
  if (!html) return true;
  const lower = html.toLowerCase();
  return (
    lower.includes('não informado') ||
    /quadra[^<]{0,40}(?:—|n\/a|não)/i.test(html) ||
    /lote[^<]{0,40}(?:—|n\/a|não)/i.test(html)
  );
}

export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV === 'production') {
    return NextResponse.json({ error: 'blocked_in_production' }, { status: 403 });
  }
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

  const limit = Math.min(
    5000,
    Math.max(100, Number(request.nextUrl.searchParams.get('limit') || 2000)),
  );

  const { data: contracts, error } = await sb
    .from('contracts')
    .select(
      'id,contract_number,tenant_id,company_id,sale_id,version,status,is_current,generated_html,project_name_snapshot',
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    // Fallback sem colunas opcionais (is_current / company_id / generated_html).
    const fallbackSelect =
      'id,contract_number,tenant_id,sale_id,version,status,generated_html';
    const fallback = await sb
      .from('contracts')
      .select(fallbackSelect)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (fallback.error) {
      return NextResponse.json(
        { error: fallback.error.message, primaryError: error.message },
        { status: 500 },
      );
    }
    return NextResponse.json(
      await aggregateAudit(sb, (fallback.data || []) as ContractAuditRow[]),
    );
  }

  return NextResponse.json(
    await aggregateAudit(sb, (contracts || []) as ContractAuditRow[]),
  );
}

async function aggregateAudit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  rows: ContractAuditRow[],
) {
  const saleIds = [
    ...new Set(rows.map((r) => r.sale_id).filter(Boolean) as string[]),
  ];
  const companyIds = [
    ...new Set(
      rows
        .map((r) => r.tenant_id || r.company_id)
        .filter(Boolean) as string[],
    ),
  ];

  const salesById = new Map<string, SaleLite>();
  for (let i = 0; i < saleIds.length; i += 200) {
    const chunk = saleIds.slice(i, i + 200);
    const { data: sales } = await sb
      .from('sales')
      .select('id,total_value,agreed_price,payment_type,block_id')
      .in('id', chunk);
    for (const s of (sales || []) as SaleLite[]) {
      salesById.set(s.id, s);
    }
  }

  const companiesById = new Map<string, CompanyLite>();
  for (let i = 0; i < companyIds.length; i += 200) {
    const chunk = companyIds.slice(i, i + 200);
    const { data: companies } = await sb
      .from('companies')
      .select('id,name,contract_model')
      .in('id', chunk);
    for (const c of (companies || []) as CompanyLite[]) {
      companiesById.set(c.id, c);
    }
  }

  type Bucket = {
    companyId: string;
    companyName: string;
    contractModel: string;
    defectiveVersions: number;
    defectiveCurrent: number;
    sampleContractNumbers: string[];
  };

  const buckets = new Map<string, Bucket>();
  let scanned = 0;
  let defective = 0;

  for (const row of rows) {
    scanned += 1;
    const sale = row.sale_id ? salesById.get(row.sale_id) : undefined;
    const saleValue =
      Number(sale?.total_value) ||
      Number(sale?.agreed_price) ||
      Number(row.sale_value) ||
      0;

    const zeroedHtml = htmlLooksZeroed(row.generated_html);
    const missingLot = htmlMissingLot(row.generated_html);
    const contractValueZero =
      row.sale_value != null ? !(Number(row.sale_value) > 0) : false;

    const suspicious =
      (saleValue > 0 && (zeroedHtml || contractValueZero)) ||
      (Boolean(sale?.block_id) && missingLot && saleValue > 0);

    if (!suspicious) continue;
    defective += 1;

    const companyId = String(row.tenant_id || row.company_id || 'unknown');
    const company = companiesById.get(companyId);
    const model = String(company?.contract_model || 'UNKNOWN');
    const key = `${companyId}::${model}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        companyId,
        companyName: String(company?.name || companyId.slice(0, 8)),
        contractModel: model,
        defectiveVersions: 0,
        defectiveCurrent: 0,
        sampleContractNumbers: [],
      };
      buckets.set(key, bucket);
    }
    bucket.defectiveVersions += 1;
    if (
      row.is_current !== false &&
      String(row.status || '').toLowerCase() !== 'superseded'
    ) {
      bucket.defectiveCurrent += 1;
    }
    const num = String(row.contract_number || '').trim();
    if (num && bucket.sampleContractNumbers.length < 5) {
      bucket.sampleContractNumbers.push(num);
    }
  }

  const byCompanyModel = [...buckets.values()].sort(
    (a, b) => b.defectiveVersions - a.defectiveVersions,
  );

  return {
    success: true,
    readOnly: true,
    repaired: false,
    scannedContracts: scanned,
    potentiallyDefectiveVersions: defective,
    companiesAffected: byCompanyModel.length,
    byCompanyModel,
    note:
      'Auditoria somente leitura. Não altera contratos. Amostra limitada a contract_number (sem PII).',
  };
}
