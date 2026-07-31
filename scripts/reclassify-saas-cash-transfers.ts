/**
 * Etapa 1 — Diagnóstico e reclassificação de transferências Asaas
 * já importadas em saas_cash_movements como expense (devem ser type=transfer).
 *
 * Dry-run (padrão — NÃO altera dados):
 *   npx tsx scripts/reclassify-saas-cash-transfers.ts
 *
 * Aplicar (somente com autorização explícita):
 *   APPLY=true npx tsx scripts/reclassify-saas-cash-transfers.ts
 *
 * Opcional:
 *   OUT=path/to/report.json  — grava relatório completo
 *   ENV_FILE=path/.env       — arquivo env adicional
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnvFile(file: string): Record<string, string> {
  const full = path.join(process.cwd(), file);
  if (!fs.existsSync(full)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(full, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const cleaned = t.startsWith('export ') ? t.slice(7).trim() : t;
    const eq = cleaned.indexOf('=');
    if (eq < 0) continue;
    const key = cleaned.slice(0, eq).trim();
    let v = cleaned.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    v = v.replace(/\\n/g, '\n').replace(/\\r/g, '\r').trim();
    // vercel env pull sem decrypt deixa placeholders
    if (!key || !v || v === '[SENSITIVE]') continue;
    if (!(key in out)) out[key] = v;
  }
  return out;
}

/** Credenciais reais via API Vercel (mesmo padrão dos scripts diagnose-*). */
async function loadDecryptedVercelProductionEnv(): Promise<Record<string, string>> {
  const authPath =
    process.env.VERCEL_AUTH_PATH ||
    'C:/Users/User/AppData/Roaming/xdg.data/com.vercel.cli/auth.json';
  if (!fs.existsSync(authPath)) return {};
  const auth = JSON.parse(fs.readFileSync(authPath, 'utf8')) as { token?: string };
  if (!auth.token) return {};
  const projectId = 'prj_qpba9orEU4kJNRHqMLVM1Khp3GIP';
  const out: Record<string, string> = {};
  for (const target of ['production', 'preview', 'development'] as const) {
    const res = await fetch(
      `https://api.vercel.com/v9/projects/${projectId}/env?decrypt=true&target=${target}`,
      { headers: { Authorization: `Bearer ${auth.token}` } },
    );
    if (!res.ok) continue;
    const data = (await res.json()) as { envs?: Array<{ key: string; value?: string }> };
    const hasKey = data.envs?.some(
      (e) => e.key === 'SUPABASE_SERVICE_ROLE_KEY' && e.value && e.value !== '[SENSITIVE]',
    );
    if (!hasKey) continue;
    for (const item of data.envs || []) {
      if (item.key && item.value && item.value !== '[SENSITIVE]') {
        out[item.key] = item.value;
      }
    }
    return out;
  }
  return out;
}

const TRANSFER_CATEGORIES = new Set([
  'Saque',
  'Transferência',
  'Transferência Pix',
  'Saída Pix (a classificar)',
]);

/** Tipos Asaas que, sozinhos, indicam transfer (PIX debit exige evidência extra). */
const TRANSFER_ASAAS_TYPES = new Set([
  'TRANSFER',
  'BACEN_JUDICIAL_TRANSFER',
  'INTERNAL_TRANSFER_DEBIT',
]);

const PIX_TRANSFER_DESC_RE =
  /\b(saque|transfer[eê]ncia|retirada|resgate|para\s+conta|conta\s+pr[oó]pria|ted|doc)\b/i;

type CandidateRule =
  | 'source_asaas_transfer+category'
  | 'source_asaas_transfer+asaas_type'
  | 'source_asaas_transfer+fallback'
  | 'pix_debit+transferId'
  | 'pix_debit+description_transfer'
  | 'pix_debit+pending_review';

type Row = {
  id: string;
  type: string;
  source: string | null;
  category: string | null;
  amount: number | string | null;
  movement_date: string | null;
  description: string | null;
  asaas_payment_id: string | null;
  metadata: Record<string, unknown> | null;
};

function classifyCandidate(row: Row): {
  ok: boolean;
  rule: CandidateRule | null;
  skipReason: string | null;
} {
  const cat = String(row.category || '');
  const meta = (row.metadata || {}) as Record<string, unknown>;
  const asaasType = String(meta.asaas_type || '').toUpperCase();
  const desc = String(row.description || meta.asaas_description || '');
  const hasTransferId = Boolean(String(meta.asaas_transfer_id || '').trim());

  if (
    cat === 'Pagamento de conta' ||
    cat === 'Pagamento Pix' ||
    asaasType === 'BILL_PAYMENT'
  ) {
    return { ok: false, rule: null, skipReason: 'bill_or_pix_payment_is_expense' };
  }

  if (TRANSFER_CATEGORIES.has(cat)) {
    return { ok: true, rule: 'source_asaas_transfer+category', skipReason: null };
  }
  if (TRANSFER_ASAAS_TYPES.has(asaasType)) {
    return { ok: true, rule: 'source_asaas_transfer+asaas_type', skipReason: null };
  }

  if (
    asaasType === 'PIX_TRANSACTION_DEBIT' ||
    (asaasType.includes('PIX') && asaasType.includes('DEBIT'))
  ) {
    if (hasTransferId) {
      return { ok: true, rule: 'pix_debit+transferId', skipReason: null };
    }
    if (PIX_TRANSFER_DESC_RE.test(desc)) {
      return { ok: true, rule: 'pix_debit+description_transfer', skipReason: null };
    }
    // Ambíguo: reclassificar para transfer (fora do P&L) com revisão posterior
    return { ok: true, rule: 'pix_debit+pending_review', skipReason: null };
  }

  if (String(row.source || '') === 'asaas_transfer') {
    return { ok: true, rule: 'source_asaas_transfer+fallback', skipReason: null };
  }
  return { ok: false, rule: null, skipReason: 'not_transfer_like' };
}

async function main() {
  const apply = String(process.env.APPLY || '').toLowerCase() === 'true';
  const outPath = process.env.OUT || '';

  const explicitEnv = (process.env.ENV_FILE || '').trim();
  const decrypted = await loadDecryptedVercelProductionEnv();
  const fileEnv = {
    ...loadEnvFile('.env.runtime.production'),
    ...loadEnvFile('.env.vercel.production.live'),
    ...loadEnvFile('.env.prod.apply'),
    ...loadEnvFile('.env.production.local'),
    ...loadEnvFile('.env.vercel.production'),
    ...loadEnvFile('.env.local'),
    ...(explicitEnv ? loadEnvFile(explicitEnv) : {}),
    ...decrypted,
  };
  const url = String(
    fileEnv.NEXT_PUBLIC_SUPABASE_URL ||
      fileEnv.SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      '',
  ).trim();
  const key = String(
    fileEnv.SUPABASE_SERVICE_ROLE_KEY ||
      fileEnv.SUPABASE_SERVICE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      '',
  ).trim();
  if (!url || !/^https?:\/\//i.test(url) || !key) {
    throw new Error(
      'Missing/invalid SUPABASE URL/SERVICE_ROLE (vercel pull [SENSITIVE] ou API decrypt indisponível)',
    );
  }

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const pageSize = 1000;
  let from = 0;
  const all: Row[] = [];
  for (;;) {
    const { data, error } = await admin
      .from('saas_cash_movements')
      .select(
        'id, type, source, category, amount, movement_date, description, asaas_payment_id, metadata',
      )
      .eq('type', 'expense')
      .eq('source', 'asaas_transfer')
      .order('movement_date', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = (data || []) as Row[];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  const skipped: Array<{ id: string; skipReason: string }> = [];
  const candidates: Array<{
    id: string;
    type: string;
    source: string | null;
    category: string | null;
    amount: number;
    movement_date: string | null;
    description: string;
    asaas_payment_id: string | null;
    asaas_type: string | null;
    asaas_transfer_id: string | null;
    rule: CandidateRule;
  }> = [];

  for (const row of all) {
    const decided = classifyCandidate(row);
    if (!decided.ok || !decided.rule) {
      skipped.push({
        id: row.id,
        skipReason: decided.skipReason || 'unknown',
      });
      continue;
    }
    const meta = (row.metadata || {}) as Record<string, unknown>;
    candidates.push({
      id: row.id,
      type: row.type,
      source: row.source,
      category: row.category,
      amount: Number(row.amount || 0),
      movement_date: row.movement_date,
      description: String(row.description || ''),
      asaas_payment_id: row.asaas_payment_id,
      asaas_type: meta.asaas_type != null ? String(meta.asaas_type) : null,
      asaas_transfer_id:
        meta.asaas_transfer_id != null ? String(meta.asaas_transfer_id) : null,
      rule: decided.rule,
    });
  }

  const total = candidates.reduce((s, r) => s + r.amount, 0);
  const byRule: Record<string, { count: number; total: number }> = {};
  for (const c of candidates) {
    if (!byRule[c.rule]) byRule[c.rule] = { count: 0, total: 0 };
    byRule[c.rule].count += 1;
    byRule[c.rule].total += c.amount;
  }

  const report = {
    mode: apply ? 'APPLY' : 'DRY_RUN',
    generatedAt: new Date().toISOString(),
    supabaseHost: (() => {
      try {
        return new URL(url).host;
      } catch {
        return 'unknown';
      }
    })(),
    scannedExpenseAsaasTransfer: all.length,
    skippedCount: skipped.length,
    skippedSample: skipped.slice(0, 20),
    candidateCount: candidates.length,
    candidateTotal: Math.round(total * 100) / 100,
    byRule,
    identificationRules: {
      includeSources: ['asaas_transfer'],
      includeCategories: [...TRANSFER_CATEGORIES],
      includeAsaasTypes: [...TRANSFER_ASAAS_TYPES],
      excludeCategories: ['Pagamento de conta'],
      excludeAsaasTypes: ['BILL_PAYMENT'],
      note: 'Candidatos são type=expense + source=asaas_transfer que não são bill payment. APPLY muda type para transfer e anota metadata.',
    },
    candidates: candidates.map((r) => ({
      id: r.id,
      movement_date: r.movement_date,
      amount: r.amount,
      description: r.description,
      source: r.source,
      category: r.category,
      asaas_payment_id: r.asaas_payment_id,
      asaas_type: r.asaas_type,
      asaas_transfer_id: r.asaas_transfer_id,
      rule: r.rule,
    })),
  };

  console.log(JSON.stringify(report, null, 2));

  if (outPath) {
    const abs = path.isAbsolute(outPath)
      ? outPath
      : path.join(process.cwd(), outPath);
    fs.writeFileSync(abs, JSON.stringify(report, null, 2), 'utf8');
    console.log(`Wrote report: ${abs}`);
  }

  if (!apply) {
    console.log(
      '\nDRY_RUN only — nenhum registro alterado. Para aplicar: APPLY=true (requer autorização).',
    );
    return;
  }

  let updated = 0;
  const failures: Array<{ id: string; error: string }> = [];
  for (const row of candidates) {
    const original = all.find((r) => r.id === row.id);
    const meta = {
      ...((original?.metadata || {}) as Record<string, unknown>),
      reclassified_from: 'expense',
      reclassified_at: new Date().toISOString(),
      reclassified_reason: 'asaas_transfer_outside_pnl',
      reclassified_rule: row.rule,
    };
    const { error: upErr } = await admin
      .from('saas_cash_movements')
      .update({ type: 'transfer', metadata: meta })
      .eq('id', row.id)
      .eq('type', 'expense');
    if (upErr) {
      failures.push({ id: row.id, error: upErr.message });
      continue;
    }
    updated += 1;
  }

  console.log(
    JSON.stringify(
      {
        mode: 'APPLY',
        updated,
        failed: failures.length,
        failures: failures.slice(0, 20),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
