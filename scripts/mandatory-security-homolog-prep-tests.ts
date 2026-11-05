/**
 * Preparação SEG-2C. Não abre banco.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  FINANCE_POLICIES_REMOVED,
  FINANCE_POLICY_ALLOWLIST,
  policyWouldAbort,
  SECURITY_HOMOLOG_STEPS,
  securityHomologBlockReason,
  USERS_POLICIES_REMOVED,
  USERS_POLICY_ALLOWLIST,
} from '../lib/security/securityLockdownHomologPlan';
import { DEVELOP_PROJECT_REF, PRODUCTION_PROJECT_REF } from '../lib/security/financeReceiptAccessPolicy';

const root = resolve(__dirname, '..');
let failed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failed += 1;
    console.error('FAIL', message);
  }
}

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function specificationBody(sql: string): string {
  const token = '\nBEGIN;\n';
  const at = sql.indexOf(token);
  return sql.slice(at + token.length).replace(/COMMIT;\s*$/, '').trim();
}

const users = read('supabase/proposals/20261105180000_users_identity_lockdown.sql');
const finance = read('supabase/proposals/20261105170000_finance_receipts_rls_lockdown.sql');
const coordinated = read('supabase/proposals/20261105190000_security_lockdown_coordinated.sql');
const precheck = read('supabase/proposals/20261105191000_security_homolog_precheck_readonly.sql');
const usersPrecheck = read('supabase/proposals/20261105180100_users_identity_precheck_readonly.sql');
const financePrecheck = read('supabase/proposals/20261105173100_finance_receipts_rls_precheck_readonly.sql');

for (const file of [precheck, usersPrecheck, financePrecheck]) {
  assert(file.includes('BEGIN READ ONLY'), 'inventário abre leitura');
  assert(file.trimEnd().endsWith('ROLLBACK;'), 'inventário termina em ROLLBACK');
  assert(!/\b(insert|update|delete|truncate|drop|grant|revoke|alter)\b/i.test(file), 'inventário sem comando de escrita');
}

assert(coordinated.split('\n').filter((line) => line.trim() === 'BEGIN;').length === 1, 'coordenado tem um BEGIN');
assert(coordinated.split('\n').filter((line) => line.trim() === 'COMMIT;').length === 1, 'coordenado tem um COMMIT');
assert(coordinated.includes(specificationBody(users)), 'coordenado contém o lockdown de usuários');
assert(coordinated.includes(specificationBody(finance)), 'coordenado contém o lockdown de recebíveis');
assert(
  coordinated.indexOf('users_protect_identity_columns') < coordinated.indexOf('CREATE POLICY "tenant_isolation_finance_receipts"'),
  'o trigger de identidade vem antes da policy financeira',
);
assert(!/USING\s*\(\s*true\s*\)/i.test(coordinated), 'coordenado não recria policy aberta');
assert(coordinated.includes("SET LOCAL lock_timeout = '5s'"), 'coordenado limita a espera por bloqueio');
assert(users.includes("has_table_privilege('authenticated', 'public.users', 'INSERT')"), 'usuários exigem INSERT após o GRANT');
assert(users.includes("has_table_privilege('authenticated', 'public.users', 'DELETE')"), 'usuários exigem DELETE após o GRANT');

const observedUsers = [
  'Enable read access for all users',
  'Enable insert for authenticated users only',
  'Usuário atualiza próprio perfil',
  'Tenant admin gerencia usuários locais',
];
assert(
  policyWouldAbort(observedUsers, USERS_POLICIES_REMOVED, USERS_POLICY_ALLOWLIST).length === 0,
  'policies de usuários já citadas não abortam',
);
assert(
  policyWouldAbort(['Policy desconhecida'], USERS_POLICIES_REMOVED, USERS_POLICY_ALLOWLIST).length === 1,
  'policy fora da lista aborta usuários',
);
assert(
  policyWouldAbort(FINANCE_POLICIES_REMOVED, FINANCE_POLICIES_REMOVED, FINANCE_POLICY_ALLOWLIST).length === 0,
  'policies amplas de recebíveis são removidas antes da checagem',
);

assert(securityHomologBlockReason({}) === 'NOT_AUTHORIZED', 'sem flag não homologa');
assert(
  securityHomologBlockReason({
    SV_LOTES_SECURITY_HOMOLOG: '1',
    SV_LOTES_SECURITY_HOMOLOG_TARGET: PRODUCTION_PROJECT_REF,
  }) === 'PRODUCTION_FORBIDDEN',
  'Production não é alvo',
);
assert(
  securityHomologBlockReason({
    SV_LOTES_SECURITY_HOMOLOG: '1',
    SV_LOTES_SECURITY_HOMOLOG_TARGET: DEVELOP_PROJECT_REF,
  }) === '',
  'Develop passa no alvo, sem executar banco',
);
assert(SECURITY_HOMOLOG_STEPS.some((step) => step.id === 'one-transaction'), 'roteiro pede uma transação');
assert(SECURITY_HOMOLOG_STEPS.some((step) => step.id === 'counts'), 'roteiro barra a escrita se a contagem divergir');

const run = spawnSync('npx', ['tsx', 'scripts/develop/security-lockdown-homolog.ts'], {
  cwd: root,
  encoding: 'utf8',
  shell: true,
});
assert(run.status === 0, 'roteiro sem autorização termina sem erro');
assert(String(run.stdout).includes('"writes":0'), 'roteiro não escreve');

const sale = read('app/api/sales/create/route.ts');
assert(sale.includes('decideServiceRoleFinanceTenantWrite'), 'venda usa a decisão de empresa');
assert(!sale.includes('user.role'), 'venda não usa o papel do JWT');
assert(read('lib/gisSaleCreateService.ts').includes('O lote não pertence à empresa da venda.'), 'lote é conferido no banco');
assert(!read('app/api/users/create/route.ts').includes('user_metadata?.role'), 'corretor não lê o papel do metadata');
assert(read('app/api/users/[id]/owner-project-access/route.ts').includes('sessionCallerDecision'), 'OWNER exige a sessão');

if (failed > 0) {
  console.error(`security-homolog-prep: ${failed} falha(s)`);
  process.exit(1);
}

console.log('security-homolog-prep: ok');
