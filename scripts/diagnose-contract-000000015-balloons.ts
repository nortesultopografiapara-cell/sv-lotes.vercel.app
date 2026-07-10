/**
 * Diagnóstico factual: contrato 000000015/2026 — balloon_config vs tabela vs HTML.
 * Uso: npx tsx scripts/diagnose-contract-000000015-balloons.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { resolveContractBalloonAddons } from '../lib/saleBalloonRepository';
import { resolveSaleBalloonPlan } from '../lib/saleBalloonInstallments';
import type { SaleBalloonFormConfig } from '../lib/saleBalloonInstallments';

const CONTRACT_NUMBER = '000000015/2026';

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

function extractBalloonQty(html: string): string | null {
  const m = html.match(/Quantidade:\s*<strong>(\d+)<\/strong>/i);
  return m?.[1] ?? null;
}

function extractBalloonParcels(html: string): string[] {
  return [...html.matchAll(/Parcela\s+(\d+)/gi)].map((m) => m[1]);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || !/^https?:\/\//i.test(url)) {
    throw new Error(
      `Supabase env inválido (urlOk=${Boolean(url && /^https?:\/\//i.test(url || ''))}, keyLen=${(key || '').length})`,
    );
  }
  console.log('ENV_SOURCE_OK', { urlHost: new URL(url).host, keyLen: key.length });

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: contracts, error: ce } = await sb
    .from('contracts')
    .select(
      'id,contract_number,sale_id,version,is_current,needs_regenerar,updated_at,generated_html,status',
    )
    .eq('contract_number', CONTRACT_NUMBER)
    .order('version', { ascending: false });

  if (ce) throw ce;

  const summary = (contracts || []).map((x) => {
    const html = String(x.generated_html || '');
    return {
      id: x.id,
      version: x.version,
      is_current: x.is_current,
      needs_regenerar: x.needs_regenerar,
      status: x.status,
      sale_id: x.sale_id,
      updated_at: x.updated_at,
      html_len: html.length,
      qty: extractBalloonQty(html),
      parcels: extractBalloonParcels(html).slice(0, 60),
      parcel_count: extractBalloonParcels(html).length,
    };
  });
  console.log('CONTRACTS', JSON.stringify(summary, null, 2));

  const current =
    (contracts || []).find((x) => x.is_current) || (contracts || [])[0];
  if (!current?.sale_id) {
    console.log('NO_SALE_ID');
    return;
  }
  const saleId = String(current.sale_id);

  const { data: sale, error: se } = await sb
    .from('sales')
    .select(
      'id,use_balloon_installments,balloon_mode,balloon_config,installments_count,total_value,agreed_price,final_value,down_payment,payment_type,updated_at',
    )
    .eq('id', saleId)
    .maybeSingle();
  if (se) throw se;
  console.log('SALE', JSON.stringify(sale, null, 2));

  const { data: balloons, error: be } = await sb
    .from('sale_balloon_installments')
    .select('*')
    .eq('sale_id', saleId)
    .order('installment_number');
  if (be) {
    console.log('BALLOON_ROWS_ERROR', be);
  } else {
    console.log('BALLOON_ROWS_COUNT', (balloons || []).length);
    console.log(
      'BALLOON_ROWS',
      JSON.stringify(
        (balloons || []).map((r) => ({
          installment_number: r.installment_number,
          additional_amount: r.additional_amount,
          due_date: r.due_date,
        })),
        null,
        2,
      ),
    );
  }

  const { data: receipts } = await sb
    .from('finance_receipts')
    .select('installment_number,amount,status,due_date')
    .eq('sale_id', saleId)
    .neq('status', 'cancelado')
    .order('installment_number');

  const monthly = (receipts || []).filter((r) => Number(r.installment_number) >= 1);
  const amounts = [...new Set(monthly.map((x) => Number(x.amount)))].sort(
    (a, b) => a - b,
  );
  console.log('RECEIPTS_COUNT', (receipts || []).length);
  console.log('RECEIPT_UNIQUE_AMOUNTS', amounts);
  console.log(
    'RECEIPTS_06_18',
    JSON.stringify(
      monthly.filter((x) => [6, 18].includes(Number(x.installment_number))),
      null,
      2,
    ),
  );

  const min = Math.min(...monthly.map((x) => Number(x.amount)));
  const inferred = monthly
    .filter((x) => Number(x.amount) > min + 0.009)
    .map((x) => ({ n: x.installment_number, a: x.amount }));
  console.log('INFERRED_GT_MIN_COUNT', inferred.length);

  const tableRows = balloons || [];
  const selected = resolveContractBalloonAddons({
    sale: (sale || {}) as Record<string, unknown>,
    tableRows,
  });

  const rawConfig = sale?.balloon_config as SaleBalloonFormConfig | null;
  let configPlanItems: Array<{ installmentNumber: number; additionalAmount: number }> =
    [];
  if (sale?.use_balloon_installments && rawConfig) {
    const plan = resolveSaleBalloonPlan({
      useBalloon: true,
      installmentsCount: Math.max(1, Number(sale.installments_count) || 0),
      contractValue:
        Number(sale.total_value) ||
        Number(sale.agreed_price) ||
        Number(sale.final_value) ||
        0,
      config: rawConfig,
    });
    configPlanItems = plan.items.map((i) => ({
      installmentNumber: i.installmentNumber,
      additionalAmount: i.additionalAmount,
    }));
  }

  const selectedSource =
    sale?.use_balloon_installments &&
    rawConfig &&
    configPlanItems.length > 0
      ? 'balloon_config'
      : tableRows.length > 0
        ? 'sale_balloon_installments'
        : 'none';

  console.log(
    'RESOLVE_DIAGNOSTIC',
    JSON.stringify(
      {
        saleId,
        use_balloon_installments: sale?.use_balloon_installments,
        balloon_mode: sale?.balloon_mode,
        balloon_config: sale?.balloon_config,
        configPlanItems,
        tableAddons: tableRows.map((r) => ({
          installment_number: r.installment_number,
          additional_amount: r.additional_amount,
        })),
        selectedSource,
        selectedAddons: selected,
        selectedCount: selected.length,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
