/**
 * Atribuição EXPLÍCITA de Administrador Principal — somente DEVELOP.
 * Sem heurística automática. Sem Production.
 *
 * npx tsx scripts/develop/assign-primary-admin.ts --company-id UUID --user-id UUID
 * npx tsx scripts/develop/assign-primary-admin.ts --company-id UUID --user-id UUID --replace
 */
import { createClient } from '@supabase/supabase-js';
import { assertDevelopWriteAllowed, loadDevelopEnv } from './guard';
import { PRODUCTION_PROJECT_REF } from '../../lib/homolog/env';
import { assignCompanyPrimaryAdmin } from '../../lib/companyPrimaryAdmin';

function arg(name: string): string | null {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return null;
  return process.argv[idx + 1] || null;
}

async function main() {
  const target = assertDevelopWriteAllowed();
  const env = loadDevelopEnv();
  if (env.ref === PRODUCTION_PROJECT_REF) {
    throw new Error('ABORT: recusa Production.');
  }
  if (!env.url || !env.service) {
    throw new Error('ABORT: env DEVELOP incompleto.');
  }

  const companyId = arg('--company-id');
  const userId = arg('--user-id');
  const allowReplace = process.argv.includes('--replace');
  if (!companyId || !userId) {
    throw new Error('Uso: --company-id UUID --user-id UUID [--replace]');
  }

  const admin = createClient(env.url, env.service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const result = await assignCompanyPrimaryAdmin(admin, {
    companyId,
    userId,
    allowReplace,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        developOnly: true,
        ref: target.ref,
        companyId,
        primaryAdminUserId: result.primaryAdminUserId,
        unchanged: result.unchanged,
        replaced: allowReplace && !result.unchanged,
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
