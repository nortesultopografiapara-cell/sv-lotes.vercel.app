/**
 * Diagnóstico: contrato 000000059/2026 — primeiro vencimento no Quadro Financeiro.
 * Uso: npx tsx scripts/diagnose-contract-000000059-first-due.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { resolveContractPaymentDates } from '../lib/contractPaymentDates';

const CONTRACT_NUMBER = '000000059/2026';

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
    if (!process.env[key] || !String(process.env[key]).trim()) {
      process.env[key] = value;
    }
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env.production.local');
loadEnvFile('.env.vercel.pull.production');
loadEnvFile('.env.vercel.pull.live');
loadEnvFile('.env.runtime.production');

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || !/^https?:\/\//i.test(url)) {
    throw new Error('Supabase env inválido');
  }

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: contracts, error: ce } = await sb
    .from('contracts')
    .select(
      'id,contract_number,sale_id,version,is_current,status,contract_model,generated_html,company_id',
    )
    .eq('contract_number', CONTRACT_NUMBER)
    .order('version', { ascending: false });
  if (ce) throw ce;

  const current =
    (contracts || []).find((c) => c.is_current) || (contracts || [])[0];
  if (!current) throw new Error('Contrato não encontrado');

  const html = String(current.generated_html || '');
  const quadroMatch = html.match(/Primeiro vencimento[\s\S]{0,220}/i);

  console.log(
    'CONTRACT',
    JSON.stringify(
      {
        id: current.id,
        version: current.version,
        is_current: current.is_current,
        status: current.status,
        contract_model: current.contract_model,
        sale_id: current.sale_id,
        htmlLen: html.length,
      },
      null,
      2,
    ),
  );
  console.log(
    'QUADRO_SNIPPET',
    quadroMatch
      ? quadroMatch[0].replace(/\s+/g, ' ').slice(0, 320)
      : 'NOT_FOUND',
  );
  console.log(
    'HAS_EMPTY_FIRST_DUE',
    /Primeiro vencimento[\s\S]{0,160}—/.test(html) ||
      /Primeiro vencimento[\s\S]{0,160}-{2,}/.test(html),
  );
  console.log('HAS_07092026_IN_HTML', html.includes('07/09/2026'));

  const saleId = String(current.sale_id);
  const { data: sale, error: se } = await sb
    .from('sales')
    .select(
      'id,company_id,lot_price,agreed_price,down_payment,installments_count,installment_value,first_installment_due_date,down_payment_due_date,sale_date,balloon_config,contract_model',
    )
    .eq('id', saleId)
    .maybeSingle();
  if (se) throw se;
  console.log('SALE', JSON.stringify(sale, null, 2));

  const { data: receipts, error: re } = await sb
    .from('finance_receipts')
    .select('installment_number,due_date,amount,status')
    .eq('sale_id', saleId)
    .order('installment_number', { ascending: true });
  if (re) throw re;

  const list = receipts || [];
  const entry = list.find((r) => Number(r.installment_number) === 0);
  const firstMonthly = list
    .filter((r) => Number(r.installment_number) >= 1)
    .sort(
      (a, b) =>
        Number(a.installment_number) - Number(b.installment_number) ||
        String(a.due_date).localeCompare(String(b.due_date)),
    )[0];
  const inst24 = list.find((r) => Number(r.installment_number) === 24);

  console.log('ENTRY', entry);
  console.log('FIRST_MONTHLY', firstMonthly);
  console.log('INST_24', inst24);
  console.log('RECEIPTS_COUNT', list.length);

  const paymentDates = resolveContractPaymentDates(
    (sale || {}) as Record<string, unknown>,
    list,
  );
  console.log('RESOLVED_PAYMENT_DATES', paymentDates);

  const { data: company } = await sb
    .from('companies')
    .select('id,name,contract_model')
    .eq('id', sale?.company_id || current.company_id)
    .maybeSingle();
  console.log('COMPANY', JSON.stringify(company, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
