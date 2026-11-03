/**
 * Verifica persistência real via updateProjectWithFallback no DEVELOP.
 * Grava um JSON de prova no Beira Rio, lê de volta, e restaura o valor anterior.
 * Sem SQL UPDATE avulso. Não toca Production.
 * npx tsx scripts/develop/verify-lf-contract-config-persist.ts
 */
import { createClient } from '@supabase/supabase-js';
import { DEVELOP_PROJECT_REF } from '../../lib/homolog/env';
import { assertDevelopWriteAllowed, loadDevelopEnv } from './guard';
import { lfContractConfigPersistedEquals } from '../../lib/lfImoveisContractConfig';
import { updateProjectWithFallback } from '../../lib/projects-update';

const PROBE = {
  secondVendor: {
    name: 'Bruno Beira Persist Probe',
    cpf: '390.533.447-05',
    rg: '',
    rgIssuer: '',
    rgUf: '',
    nationality: '',
    maritalStatus: '',
    profession: '',
    email: '',
    phone: '',
    address: '',
  },
  participation: {
    firstVendorPercent: 25,
    secondVendorPercent: 75,
  },
};

async function main() {
  const target = assertDevelopWriteAllowed();
  const env = loadDevelopEnv();
  if (!env.service) throw new Error('ABORT: sem service role.');
  const admin = createClient(env.url, env.service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const found = await admin
    .from('projects')
    .select('id, name, city, uf, lf_contract_config_json')
    .ilike('name', '%beira%rio%')
    .maybeSingle();
  if (found.error || !found.data) {
    throw new Error(found.error?.message || 'Beira Rio não encontrado no DEVELOP.');
  }

  const project = found.data as {
    id: string;
    name: string;
    city: string | null;
    uf: string | null;
    lf_contract_config_json: unknown;
  };
  const previous = project.lf_contract_config_json ?? null;

  const save = await updateProjectWithFallback(admin, project.id, {
    name: project.name,
    city: project.city || 'Parauapebas',
    uf: project.uf || 'PA',
    lf_contract_config_json: PROBE,
  });
  if (save.error || !save.data) {
    throw new Error(`SAVE_FAIL: ${save.error?.message || 'sem row'}`);
  }

  const afterSave = await admin
    .from('projects')
    .select('id, name, lf_contract_config_json')
    .eq('id', project.id)
    .single();
  if (afterSave.error) throw new Error(afterSave.error.message);
  const persisted = (afterSave.data as { lf_contract_config_json?: unknown })
    .lf_contract_config_json;
  const persistOk = lfContractConfigPersistedEquals(persisted, PROBE);

  const restore = await updateProjectWithFallback(admin, project.id, {
    name: project.name,
    city: project.city || 'Parauapebas',
    uf: project.uf || 'PA',
    lf_contract_config_json: previous,
  });
  if (restore.error) {
    throw new Error(`RESTORE_FAIL: ${restore.error.message}`);
  }

  const afterRestore = await admin
    .from('projects')
    .select('lf_contract_config_json')
    .eq('id', project.id)
    .single();

  console.log(
    JSON.stringify(
      {
        ok: persistOk,
        env: 'DEVELOP',
        ref: DEVELOP_PROJECT_REF,
        branch: target.branch,
        project: project.name,
        before: previous,
        after_save_matches_probe: persistOk,
        after_save_participation:
          persisted && typeof persisted === 'object'
            ? (persisted as { participation?: unknown }).participation
            : null,
        restored_to_previous: lfContractConfigPersistedEquals(
          (afterRestore.data as { lf_contract_config_json?: unknown })
            ?.lf_contract_config_json,
          previous,
        ),
        write: 'CODE_PATH_THEN_RESTORE',
      },
      null,
      2,
    ),
  );
  if (!persistOk) process.exit(2);
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
