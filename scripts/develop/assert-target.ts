/**
 * Confirma branch + Project Ref DEVELOP sem imprimir secrets.
 * npx tsx scripts/develop/assert-target.ts
 */
import { assertDevelopWriteAllowed, loadDevelopEnv, currentGitBranch } from './guard';
import { DEVELOP_PROJECT_REF, PRODUCTION_PROJECT_REF } from '../../lib/homolog/env';

const env = loadDevelopEnv();
let writeCheck: { branch: string; ref: string; source: string } | null = null;
let writeError: string | null = null;
try {
  const ok = assertDevelopWriteAllowed();
  writeCheck = { branch: ok.branch, ref: ok.ref, source: ok.source };
} catch (e) {
  writeError = e instanceof Error ? e.message : String(e);
}

console.log(
  JSON.stringify(
    {
      branch: currentGitBranch(),
      developRefExpected: DEVELOP_PROJECT_REF,
      productionRefForbidden: PRODUCTION_PROJECT_REF,
      loadedRef: env.ref,
      loadedSource: env.source,
      hasAnon: env.anon.length > 20 && !/SENSITIVE/i.test(env.anon),
      hasServiceRole: env.service.length > 20 && !/SENSITIVE/i.test(env.service),
      writeAllowed: Boolean(writeCheck) && !writeError,
      writeCheck,
      writeError,
    },
    null,
    2,
  ),
);

if (writeError) process.exit(3);
