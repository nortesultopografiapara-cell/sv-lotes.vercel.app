/**
 * Diagnóstico somente leitura — contratos 000000062 e 000000063 (Meneses).
 * npx tsx scripts/diagnose-meneses-062-063-finance.ts
 * NÃO altera dados.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const CONTRACTS = ['000000062/2026', '000000063/2026'];

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

async function main() {
  loadEnvFile('.env.local');
  loadEnvFile('.env.production.local');
  loadEnvFile('.env.vercel.pull.live');
  loadEnvFile('.env.vercel.pull.production');
  loadEnvFile('.env.runtime.production');
  await loadProductionEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || !/^https?:\/\//i.test(url)) {
    console.log('ENV_UNAVAILABLE — diagnóstico limitado ao código', {
      urlLen: (url || '').length,
      keyLen: (key || '').length,
    });
    process.exit(0);
  }
  console.log('ENV_OK', { host: new URL(url).host });

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let menesesCompanyId: string | null = null;

  for (const contractNumber of CONTRACTS) {
    console.log('\n====', contractNumber, '====');
    const { data: contracts, error: ce } = await sb
      .from('contracts')
      .select(
        'id,contract_number,sale_id,company_id,tenant_id,version,is_current,status,contract_model,customer_id',
      )
      .eq('contract_number', contractNumber)
      .order('version', { ascending: false });
    if (ce) throw ce;
    const current =
      (contracts || []).find((c) => c.is_current) || (contracts || [])[0];
    if (!current) {
      console.log('NOT_FOUND');
      continue;
    }
    console.log('CONTRACT', {
      id: current.id,
      version: current.version,
      is_current: current.is_current,
      sale_id: current.sale_id,
      company_id: current.company_id,
      tenant_id: current.tenant_id,
      status: current.status,
    });

    const saleId = String(current.sale_id);
    const { data: sale, error: se } = await sb
      .from('sales')
      .select(
        'id,company_id,tenant_id,payment_type,installments_count,installment_value,lot_price,agreed_price,total_value,final_value,down_payment,discount,down_payment_due_date,first_installment_due_date,sale_date,customer_id',
      )
      .eq('id', saleId)
      .maybeSingle();
    if (se) throw se;
    menesesCompanyId = String(sale?.company_id || current.company_id || '');
    console.log('SALE', {
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
    });

    const { count, error: countErr } = await sb
      .from('finance_receipts')
      .select('id', { count: 'exact', head: true })
      .eq('sale_id', saleId);
    if (countErr) throw countErr;
    console.log('RECEIPTS_COUNT_EXACT', count);

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
      if (re) throw re;
      if (!chunk?.length) break;
      all.push(...(chunk as ReceiptRow[]));
      if (chunk.length < page) break;
      from += page;
    }

    const numbers = all
      .map((r) => Number(r.installment_number))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    const dueDates = all
      .map((r) => String(r.due_date || '').split('T')[0])
      .filter(Boolean)
      .sort();
    console.log('RECEIPTS_LOADED', all.length);
    console.log('INSTALLMENT_NUMBERS', numbers.join(','));
    console.log('MIN_MAX_INSTALLMENT', {
      min: numbers[0] ?? null,
      max: numbers[numbers.length - 1] ?? null,
    });
    console.log('MIN_MAX_DUE', {
      min: dueDates[0] ?? null,
      max: dueDates[dueDates.length - 1] ?? null,
    });

    const byNum = new Map<number, number>();
    for (const n of numbers) byNum.set(n, (byNum.get(n) || 0) + 1);
    const duplicates = [...byNum.entries()]
      .filter(([, c]) => c > 1)
      .map(([n, c]) => ({ installment_number: n, count: c }));
    console.log('DUPLICATES_BY_INSTALLMENT_NUMBER', duplicates);

    const expected = Math.max(1, Number(sale?.installments_count) || 0);
    const monthly = numbers.filter((n) => n >= 1);
    const missing: number[] = [];
    for (let i = 1; i <= expected; i++) {
      if (!monthly.includes(i)) missing.push(i);
    }
    console.log('EXPECTED_INSTALLMENTS', expected);
    console.log('MISSING_NUMBERS', missing.join(',') || '(none)');
    console.log(
      'STATUS_COUNTS',
      all.reduce(
        (acc, r) => {
          const st = String(r.status || 'null');
          acc[st] = (acc[st] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    );
    console.log(
      'STATUS_BY_INSTALLMENT',
      all.map((r) => ({
        n: r.installment_number,
        due: r.due_date,
        amount: r.amount,
        status: r.status,
      })),
    );

    if (sale?.customer_id) {
      const { count: orphanCount } = await sb
        .from('finance_receipts')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', sale.customer_id)
        .is('sale_id', null);
      console.log('ORPHAN_RECEIPTS_SAME_CUSTOMER_NULL_SALE', orphanCount);
    }
  }

  if (menesesCompanyId) {
    console.log('\n==== POSTGREST_TRUNCATION_PROBE ====');
    console.log('company_id', menesesCompanyId);
    const { count: tenantExact } = await sb
      .from('finance_receipts')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', menesesCompanyId);
    console.log('TENANT_RECEIPTS_COUNT_EXACT', tenantExact);

    const { data: unpaged, error: upErr } = await sb
      .from('finance_receipts')
      .select('id,sale_id,installment_number,due_date')
      .eq('company_id', menesesCompanyId)
      .order('due_date', { ascending: true });
    if (upErr) console.log('UNPAGED_ERROR', upErr.message);
    const unpagedLen = unpaged?.length ?? 0;
    console.log('UNPAGED_RETURNED_ROWS', unpagedLen);
    console.log(
      'TRUNCATED',
      tenantExact != null && unpagedLen < tenantExact,
      {
        exact: tenantExact,
        returned: unpagedLen,
        missing: tenantExact != null ? tenantExact - unpagedLen : null,
      },
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
