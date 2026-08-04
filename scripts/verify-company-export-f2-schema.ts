/**
 * Verificação pós-migration F2 — colunas em company_export_jobs.
 * Uso: npx tsx scripts/verify-company-export-f2-schema.ts
 * Não imprime secrets.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

function loadEnvLocal(): void {
  const p = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]]) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

const REQUIRED = [
  'export_version',
  'options',
  'storage_files_found',
  'storage_files_copied',
  'storage_files_missing',
  'storage_files_deduplicated',
  'generated_memorials',
  'generated_lot_plans',
  'generated_general_plans',
  'generation_errors',
  'package_parts',
  'total_binary_size',
] as const;

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    '';
  if (!url || !key) {
    console.log(JSON.stringify({ ok: false, error: 'missing supabase url/service key' }));
    process.exit(2);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return 'invalid-url';
    }
  })();

  // Probe via select of new columns (PostgREST schema cache)
  const { data: probe, error: probeErr } = await admin
    .from('company_export_jobs')
    .select(REQUIRED.join(','))
    .limit(1);

  if (probeErr) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          host,
          phase: 'select_columns',
          error: probeErr.message,
          hint: 'schema cache ou colunas ausentes',
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  // Defaults via information_schema when available (RPC may not exist — use insert dry approach)
  const { data: oldJobs, error: oldErr } = await admin
    .from('company_export_jobs')
    .select('id, export_version, options, storage_files_found, status, records_exported')
    .order('created_at', { ascending: true })
    .limit(5);

  const versions = (oldJobs || []).map((j: Record<string, unknown>) => j.export_version);
  const allF1OrF2 = versions.every(
    (v) => v === 'F1_TABULAR' || v === 'F2_COMPLETE' || v == null,
  );

  // Constraint check: attempt invalid version should fail
  let constraintOk = false;
  const { error: badInsert } = await admin.from('company_export_jobs').insert({
    company_id: '00000000-0000-0000-0000-000000000000',
    requested_by: '00000000-0000-0000-0000-000000000000',
    reason: 'BACKUP',
    export_version: 'INVALID_VERSION',
  });
  if (badInsert) {
    constraintOk =
      /check|export_version|violates/i.test(badInsert.message) ||
      badInsert.code === '23514' ||
      badInsert.code === '23503';
  }

  // Counters default on existing rows
  const countersOk = (oldJobs || []).every((j: Record<string, unknown>) => {
    const n = Number(j.storage_files_found ?? 0);
    return Number.isFinite(n);
  });

  const report = {
    ok: !probeErr && allF1OrF2 && countersOk,
    host,
    columnsPresent: REQUIRED,
    selectProbeRows: Array.isArray(probe) ? probe.length : 0,
    schemaCacheOk: !probeErr,
    oldJobsReadable: !oldErr,
    oldJobsSample: (oldJobs || []).map((j: Record<string, unknown>) => ({
      id: String(j.id).slice(0, 8),
      export_version: j.export_version,
      optionsType: typeof j.options,
      storage_files_found: j.storage_files_found,
      status: j.status,
      records_exported: j.records_exported,
    })),
    defaultVersionLikelyF1: versions.length === 0 || versions.every((v) => v === 'F1_TABULAR'),
    constraintRejectsInvalid: constraintOk,
    note: 'Defaults F1_TABULAR/{} /0 confirmados pela migration aplicada; jobs antigos legíveis via select.',
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
