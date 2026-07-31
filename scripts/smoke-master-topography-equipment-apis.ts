/**
 * Smoke CRUD Equipamentos Fase 1A contra produção (service role + assertSuperAdmin).
 * Cria 1 equipamento de teste, valida serial único, PATCH, e arquiva ao final.
 *
 * npx tsx scripts/smoke-master-topography-equipment-apis.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { assertSuperAdmin } from '../lib/apiSuperAdmin';
import {
  createTopographyEquipment,
  getTopographyEquipmentById,
  listTopographyEquipment,
  patchTopographyEquipmentFields,
  updateTopographyEquipment,
} from '../lib/master/topography/equipmentService';
import { validateTopographyEquipmentInput } from '../lib/master/topography/equipmentValidation';

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

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

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

  assert(url && serviceKey, 'ENV_UNAVAILABLE');

  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const host = new URL(url).host;
  const stamp = Date.now();
  const serial = `TEST-EQP-1A-${stamp}`;
  const results: Record<string, unknown> = { host };

  // SUPER_ADMIN real
  const { data: sa, error: saErr } = await admin
    .from('users')
    .select('id, role, email')
    .eq('role', 'SUPER_ADMIN')
    .limit(1)
    .maybeSingle();
  assert(!saErr && sa?.id, `SUPER_ADMIN não encontrado: ${saErr?.message || 'empty'}`);
  const superAdminId = String(sa.id);

  // Usuário não SUPER_ADMIN (se existir)
  const { data: nonSa } = await admin
    .from('users')
    .select('id, role')
    .neq('role', 'SUPER_ADMIN')
    .limit(1)
    .maybeSingle();

  // assertSuperAdmin
  {
    const deniedMissing = await assertSuperAdmin(admin, null);
    assert(!deniedMissing.ok, 'sem userId deve bloquear');
    const deniedFake = await assertSuperAdmin(admin, '00000000-0000-0000-0000-000000000000');
    assert(!deniedFake.ok, 'user inexistente deve bloquear');
    const allowed = await assertSuperAdmin(admin, superAdminId);
    assert(allowed.ok, 'SUPER_ADMIN deve passar');
    if (nonSa?.id) {
      const deniedRole = await assertSuperAdmin(admin, String(nonSa.id));
      assert(!deniedRole.ok, 'não SUPER_ADMIN deve bloquear');
      results.assertSuperAdmin_nonAdminBlocked = true;
    } else {
      results.assertSuperAdmin_nonAdminBlocked = 'NO_NON_ADMIN_USER';
    }
    results.assertSuperAdmin = true;
  }

  // Validação local
  {
    let threw = false;
    try {
      validateTopographyEquipmentInput({
        name: '',
        category: 'DRONE',
        status: 'AVAILABLE',
      });
    } catch {
      threw = true;
    }
    assert(threw, 'validação nome vazio');
    results.validation = true;
  }

  // RLS anon insert deve falhar
  if (anonKey) {
    const anon = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await anon.from('master_topography_equipment').insert({
      code: `EQP-FAKE-${stamp}`,
      name: '[TEST] should fail RLS',
      category: 'DRONE',
      status: 'AVAILABLE',
    });
    assert(Boolean(error), `RLS deveria bloquear insert anon: ${error?.message || 'no error'}`);
    results.rls_anon_insert_blocked = true;
  } else {
    results.rls_anon_insert_blocked = 'ANON_KEY_MISSING';
  }

  // POST create (service = API layer)
  const input = validateTopographyEquipmentInput({
    name: `[TEST-FASE1A] Equipamento smoke ${stamp}`,
    category: 'DRONE',
    status: 'AVAILABLE',
    manufacturer: 'DJI',
    model: 'M350',
    serialNumber: serial,
    assetNumber: `PAT-TEST-${stamp}`,
    purchaseValue: 1000,
    supplier: 'Fornecedor Teste',
    invoiceNumber: `NF-TEST-${stamp}`,
    usageHours: 1.5,
    location: 'Laboratório QA',
    responsibleName: 'Smoke Tester',
    notes: 'Registro temporário Fase 1A — arquivar após smoke',
  });

  const created = await createTopographyEquipment(admin, input, superAdminId);
  assert(/^EQP-\d{4}-\d{4}$/.test(created.code), `código inválido: ${created.code}`);
  assert(created.serial_number === serial, 'serial gravado');
  results.post_create = { id: created.id, code: created.code };

  // GET list
  const listed = await listTopographyEquipment(admin, {
    q: created.code,
    includeArchived: false,
    page: 1,
    limit: 10,
  });
  assert(
    listed.equipment.some((e) => e.id === created.id),
    'GET listagem deve incluir criado',
  );
  results.get_list = { total: listed.total, found: true };

  // GET detail
  const detail = await getTopographyEquipmentById(admin, created.id);
  assert(detail?.id === created.id, 'GET detalhe');
  results.get_detail = { code: detail?.code };

  // PATCH partial
  const patched = await patchTopographyEquipmentFields(admin, created.id, {
    status: 'IN_USE',
    location: 'Campo QA',
    usage_hours: 2.25,
  });
  assert(patched.status === 'IN_USE', 'PATCH status');
  assert(patched.location === 'Campo QA', 'PATCH location');
  assert(patched.usage_hours === 2.25, 'PATCH hours');
  results.patch = {
    status: patched.status,
    location: patched.location,
    usage_hours: patched.usage_hours,
  };

  // Full update
  const updatedInput = validateTopographyEquipmentInput({
    ...input,
    name: `[TEST-FASE1A] Equipamento atualizado ${stamp}`,
    status: 'MAINTENANCE',
    notes: 'Atualizado no smoke',
  });
  const updated = await updateTopographyEquipment(admin, created.id, updatedInput);
  assert(updated.name.includes('atualizado'), 'update name');
  assert(updated.status === 'MAINTENANCE', 'update status');
  results.update = { name: updated.name, status: updated.status };

  // Serial único
  let serialUniqueBlocked = false;
  try {
    await createTopographyEquipment(
      admin,
      validateTopographyEquipmentInput({
        name: `[TEST-FASE1A] duplicata serial ${stamp}`,
        category: 'GNSS',
        status: 'AVAILABLE',
        serialNumber: serial,
      }),
      superAdminId,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    serialUniqueBlocked = msg.toLowerCase().includes('série') || msg.toLowerCase().includes('serial');
  }
  assert(serialUniqueBlocked, 'serial único deve bloquear segundo insert');
  results.serial_unique = true;

  // Cleanup: arquivar (não hard-delete)
  await patchTopographyEquipmentFields(admin, created.id, {
    // status permanece; archive via update raw
  });
  const { error: archiveErr } = await admin
    .from('master_topography_equipment')
    .update({ is_archived: true, notes: 'Arquivado após smoke Fase 1A', updated_at: new Date().toISOString() })
    .eq('id', created.id);
  assert(!archiveErr, `falha ao arquivar: ${archiveErr?.message || ''}`);
  results.cleanup_archived = true;

  console.log(
    JSON.stringify(
      {
        ok: true,
        results,
        note: 'Smoke OK. Equipamento de teste arquivado. Migration NÃO reaplicada.',
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
