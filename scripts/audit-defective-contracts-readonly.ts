/**
 * Auditoria read-only — versões de contrato potencialmente defeituosas (zeradas).
 * NÃO repara. Agrupa por empresa/modelo sem PII.
 *
 * npx tsx scripts/audit-defective-contracts-readonly.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

async function loadProductionEnv(): Promise<void> {
  const authPath =
    process.env.VERCEL_AUTH_PATH ||
    'C:/Users/User/AppData/Roaming/xdg.data/com.vercel.cli/auth.json';
  if (!fs.existsSync(authPath)) return;

  const auth = JSON.parse(fs.readFileSync(authPath, 'utf8')) as { token?: string };
  if (!auth.token) return;

  const projectId = 'prj_qpba9orEU4kJNRHqMLVM1Khp3GIP';
  const targets = ['production', 'preview', 'development'] as const;
  for (const target of targets) {
    const res = await fetch(
      `https://api.vercel.com/v9/projects/${projectId}/env?decrypt=true&target=${target}`,
      { headers: { Authorization: `Bearer ${auth.token}` } },
    );
    if (!res.ok) continue;
    const data = (await res.json()) as {
      envs?: Array<{ key: string; value?: string }>;
    };
    const serviceEnv = data.envs?.find(
      (item) => item.key === 'SUPABASE_SERVICE_ROLE_KEY',
    );
    if (!serviceEnv?.value?.length) continue;
    for (const item of data.envs || []) {
      if (item.key && item.value) process.env[item.key] = item.value;
    }
    return;
  }
}

function loadEnvFile(relPath: string): void {
  const full = path.join(process.cwd(), relPath);
  if (!fs.existsSync(full)) return;
  for (const line of fs.readFileSync(full, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value && (!process.env[key] || !String(process.env[key]).trim())) {
      process.env[key] = value;
    }
  }
}

function htmlLooksZeroed(html: string | null | undefined): boolean {
  if (!html) return true;
  const hasZero = /R\$\s*0,00/.test(html);
  const hasPositive = /R\$\s*[1-9]/.test(html);
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

async function main() {
  loadEnvFile('.env.local');
  loadEnvFile('.env.production.local');
  loadEnvFile('.env.vercel.pull.live');
  loadEnvFile('.env.vercel.pull.production');
  await loadProductionEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log(JSON.stringify({ success: false, error: 'ENV_UNAVAILABLE' }, null, 2));
    process.exit(1);
  }

  const sb = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const limit = 2000;
  const { data: contracts, error } = await sb
    .from('contracts')
    .select(
      'id,contract_number,tenant_id,company_id,sale_id,version,status,is_current,generated_html,project_name_snapshot',
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  let rows = contracts || [];
  if (error) {
    const fallback = await sb
      .from('contracts')
      .select(
        'id,contract_number,tenant_id,sale_id,version,status,generated_html',
      )
      .order('created_at', { ascending: false })
      .limit(limit);
    if (fallback.error) {
      console.log(
        JSON.stringify(
          {
            success: false,
            error: fallback.error.message,
            primaryError: error.message,
          },
          null,
          2,
        ),
      );
      process.exit(1);
    }
    rows = fallback.data || [];
  }
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

  const salesById = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < saleIds.length; i += 200) {
    const chunk = saleIds.slice(i, i + 200);
    const { data: sales } = await sb
      .from('sales')
      .select('id,total_value,agreed_price,payment_type,block_id')
      .in('id', chunk);
    for (const s of sales || []) salesById.set(String(s.id), s as Record<string, unknown>);
  }

  const companiesById = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < companyIds.length; i += 200) {
    const chunk = companyIds.slice(i, i + 200);
    const { data: companies } = await sb
      .from('companies')
      .select('id,name,contract_model')
      .in('id', chunk);
    for (const c of companies || []) {
      companiesById.set(String(c.id), c as Record<string, unknown>);
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
  let defective = 0;

  for (const row of rows) {
    const sale = row.sale_id ? salesById.get(String(row.sale_id)) : undefined;
    const saleValue =
      Number(sale?.total_value) ||
      Number(sale?.agreed_price) ||
      Number(row.sale_value) ||
      0;
    const zeroedHtml = htmlLooksZeroed(row.generated_html as string | null);
    const missingLot = htmlMissingLot(row.generated_html as string | null);
    const contractValueZero = false;
    const suspicious =
      (saleValue > 0 && zeroedHtml) ||
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

  const out = {
    success: true,
    readOnly: true,
    repaired: false,
    scannedContracts: rows.length,
    potentiallyDefectiveVersions: defective,
    companiesAffected: byCompanyModel.length,
    byCompanyModel,
  };
  console.log(JSON.stringify(out, null, 2));
  fs.writeFileSync(
    path.join(process.cwd(), 'diag-defective-contracts-summary.json'),
    JSON.stringify(out, null, 2),
    'utf8',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
