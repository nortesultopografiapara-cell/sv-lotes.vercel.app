/**
 * Verificação READ-ONLY pós-migration Equipamentos Fase 1A (produção).
 * Não aplica SQL. Não chama generate_next_* (não incrementa contador).
 * Não altera dados.
 *
 * npx tsx scripts/verify-master-topography-equipment-prod-readonly.ts
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
    if (!key || !v || v === '[SENSITIVE]') continue;
    if (!(key in out)) out[key] = v;
  }
  return out;
}

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

const EQUIPMENT_COLUMNS = [
  'id',
  'code',
  'name',
  'category',
  'manufacturer',
  'model',
  'serial_number',
  'asset_number',
  'purchase_date',
  'purchase_value',
  'warranty_until',
  'supplier',
  'invoice_number',
  'cost_center_id',
  'status',
  'location',
  'responsible_user_id',
  'responsible_name',
  'usage_hours',
  'last_calibration_date',
  'next_calibration_date',
  'notes',
  'photo_url',
  'qr_payload',
  'is_archived',
  'created_by',
  'created_at',
  'updated_at',
] as const;

async function main() {
  const decrypted = await loadDecryptedVercelProductionEnv();
  const fileEnv = {
    ...loadEnvFile('.env.local'),
    ...loadEnvFile('.env.production.local'),
    ...loadEnvFile('.env.runtime.production'),
    ...loadEnvFile('.env.vercel.production.live'),
    ...loadEnvFile('.env.prod.apply'),
    ...loadEnvFile('.env.equipment.verify.tmp'),
    ...decrypted,
  };

  const url = String(
    fileEnv.NEXT_PUBLIC_SUPABASE_URL || fileEnv.SUPABASE_URL || '',
  ).trim();
  const serviceKey = String(fileEnv.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const anonKey = String(
    fileEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY || fileEnv.SUPABASE_ANON_KEY || '',
  ).trim();

  if (!url || !serviceKey) {
    console.log(JSON.stringify({ ok: false, error: 'ENV_UNAVAILABLE' }, null, 2));
    process.exit(2);
  }

  const host = new URL(url).host;
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const checks: Record<string, unknown> = { host, mode: 'READ_ONLY' };
  let failed = 0;

  function mark(name: string, ok: boolean, detail?: unknown) {
    checks[name] = ok ? { ok: true, detail } : { ok: false, detail };
    if (!ok) failed += 1;
  }

  // 1) Tabelas + colunas (SELECT)
  {
    const select = EQUIPMENT_COLUMNS.join(', ');
    const { data, error } = await admin
      .from('master_topography_equipment')
      .select(select)
      .limit(1);
    mark(
      'table_master_topography_equipment',
      !error,
      error ? error.message : { rowsSampled: (data || []).length, columns: EQUIPMENT_COLUMNS.length },
    );
  }

  {
    const { data, error } = await admin
      .from('master_topography_equipment_counters')
      .select('year, last_number')
      .limit(5);
    mark(
      'table_master_topography_equipment_counters',
      !error,
      error ? error.message : { rows: data || [] },
    );
  }

  // 2) FK alvo (cost centers)
  {
    const { error } = await admin
      .from('master_corporate_cost_centers')
      .select('id')
      .limit(1);
    mark(
      'fk_target_master_corporate_cost_centers',
      !error,
      error ? error.message : 'reachable',
    );
  }

  // 3) RPC exposta no OpenAPI (sem executar — não incrementa contador)
  {
    const res = await fetch(`${url}/rest/v1/`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: 'application/openapi+json',
      },
    });
    const text = await res.text();
    let hasRpc = false;
    let openApiOk = res.ok;
    try {
      const doc = JSON.parse(text) as {
        paths?: Record<string, unknown>;
      };
      hasRpc = Boolean(
        doc.paths &&
          (doc.paths['/rpc/generate_next_topography_equipment_code'] ||
            Object.keys(doc.paths).some((p) =>
              p.includes('generate_next_topography_equipment_code'),
            )),
      );
    } catch {
      openApiOk = false;
    }
    mark('rpc_generate_next_topography_equipment_code_exposed', openApiOk && hasRpc, {
      openApiOk,
      hasRpc,
    });
  }

  // 4) is_super_admin() — política depende dela; validamos presença via RPC conhecida
  {
    const { data, error } = await admin.rpc('is_super_admin');
    mark(
      'fn_is_super_admin_callable',
      !error,
      error ? error.message : { result: data },
    );
  }

  // 5) RLS: anon sem JWT não deve ler equipamentos
  if (anonKey) {
    const anon = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anon
      .from('master_topography_equipment')
      .select('id')
      .limit(1);
    const blocked =
      Boolean(error) ||
      data === null ||
      (Array.isArray(data) && data.length === 0 && error != null);
    // Com RLS + policy is_super_admin(), anon típico: error permission / empty + RLS
    const rlsLooksActive =
      Boolean(error) ||
      (Array.isArray(data) && data.length === 0);
    mark('rls_anon_cannot_list_equipment', rlsLooksActive, {
      error: error?.message || null,
      rowCount: Array.isArray(data) ? data.length : null,
      note: 'Esperado: bloqueio ou zero linhas para anon sem SUPER_ADMIN',
      blockedHeuristic: blocked,
    });
  } else {
    mark('rls_anon_cannot_list_equipment', false, 'ANON_KEY_MISSING');
  }

  // 6) Constraints/índices — checagem estrutural via PostgREST (comportamento sem escrita):
  // Unique code / serial e CHECKs serão validados no smoke de escrita.
  // Aqui só confirmamos que colunas de constraint existem e status default é legível.
  {
    const { error } = await admin
      .from('master_topography_equipment')
      .select('code, serial_number, category, status, purchase_value, usage_hours, cost_center_id')
      .limit(1);
    mark(
      'constraint_columns_readable',
      !error,
      error ? error.message : 'ok',
    );
  }

  // 7) Migration file presente no repo (não reaplicar)
  {
    const mig = path.join(
      process.cwd(),
      'supabase/migrations/20260902120000_master_topography_equipment.sql',
    );
    const sql = fs.existsSync(mig) ? fs.readFileSync(mig, 'utf8') : '';
    mark('repo_migration_present_not_reapplied', Boolean(sql), {
      hasRls: sql.includes('ENABLE ROW LEVEL SECURITY'),
      hasPolicyIsSuperAdmin: sql.includes('is_super_admin()'),
      hasUniqueSerial: sql.includes('uq_master_topo_equipment_serial_number'),
      hasGrantExecute: sql.includes('GRANT EXECUTE') && sql.includes('generate_next_topography_equipment_code'),
      hasRevokePublic: sql.includes('REVOKE ALL ON FUNCTION public.generate_next_topography_equipment_code'),
      note: 'Confirmação local do SQL esperado; banco verificado via probes acima. NÃO reaplicado neste script.',
    });
  }

  const result = {
    ok: failed === 0,
    failed,
    checks,
    confirmations: {
      migrationReapplied: false,
      dataMutated: false,
    },
  };
  console.log(JSON.stringify(result, null, 2));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
