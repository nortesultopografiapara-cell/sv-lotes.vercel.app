/**
 * Leitura DEVELOP — public.projects.lf_contract_config_json.
 * Sem INSERT/UPDATE/DELETE. Não imprime CPF completo nem secrets.
 * npx tsx scripts/develop/read-lf-contract-config.ts
 */
import { createClient } from '@supabase/supabase-js';
import {
  DEVELOP_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
} from '../../lib/homolog/env';
import { loadDevelopEnv } from './guard';
import { parseLfContractConfigJson } from '../../lib/lfImoveisContractConfig';
import { isContractSecondVendorComplete } from '../../lib/contractSecondVendor';

const COLUMN = 'lf_contract_config_json';

function maskId(id: string | null | undefined): string {
  const s = String(id || '').trim();
  if (!s) return 'null';
  return `${s.slice(0, 8)}…`;
}

async function main() {
  const env = loadDevelopEnv();
  if (env.ref === PRODUCTION_PROJECT_REF) {
    throw new Error('ABORT: host alvo é Production.');
  }
  if (env.ref !== DEVELOP_PROJECT_REF) {
    throw new Error(
      `ABORT: Project Ref não é DEVELOP. esperado=${DEVELOP_PROJECT_REF} obtido=${env.ref || 'null'}`,
    );
  }
  if (!env.url || !env.service || /SENSITIVE/i.test(env.service)) {
    throw new Error('ABORT: sem service role DEVELOP.');
  }

  const admin = createClient(env.url, env.service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const probe = await admin.from('projects').select(COLUMN).limit(1);
  if (probe.error) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          env: 'DEVELOP',
          column: COLUMN,
          present: false,
          error: probe.error.message,
          write: 'NONE',
        },
        null,
        2,
      ),
    );
    process.exit(2);
  }

  const named = await admin
    .from('projects')
    .select(`id, name, contract_model, ${COLUMN}`)
    .or('name.ilike.%estrela%,name.ilike.%beira%')
    .order('name');

  if (named.error) {
    throw new Error(named.error.message);
  }

  const rows = (named.data || []).map((row) => {
    const raw = (row as { lf_contract_config_json?: unknown }).lf_contract_config_json;
    const parsed = parseLfContractConfigJson(raw);
    return {
      id: maskId(String((row as { id?: string }).id || '')),
      name: (row as { name?: string }).name,
      contract_model: (row as { contract_model?: string | null }).contract_model ?? null,
      json_is_null: raw == null,
      has_second_vendor: isContractSecondVendorComplete(parsed.secondVendor),
      second_vendor_name: parsed.secondVendor.name || null,
      participation: parsed.participation,
    };
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        env: 'DEVELOP',
        ref: DEVELOP_PROJECT_REF,
        column: `public.projects.${COLUMN}`,
        present: true,
        write: 'NONE',
        rows,
      },
      null,
      2,
    ),
  );
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
