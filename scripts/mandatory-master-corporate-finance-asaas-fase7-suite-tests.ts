/**
 * Suite Fase 7 Asaas Corporativo + regressões leves de isolamento.
 * npx tsx scripts/mandatory-master-corporate-finance-asaas-fase7-suite-tests.ts
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function run(script: string) {
  const r = spawnSync('npx', ['tsx', script], {
    cwd: root,
    encoding: 'utf8',
    shell: true,
  });
  if (r.status !== 0) {
    console.error(r.stdout);
    console.error(r.stderr);
    throw new Error(`Suite step failed: ${script}`);
  }
  console.log(r.stdout.trim().split('\n').slice(-1)[0] || script);
}

function isolationGates() {
  const saas = fs.readFileSync(path.join(root, 'app/api/payments/webhook/route.ts'), 'utf8');
  const company = fs.readFileSync(
    path.join(root, 'app/api/finance/asaas/company-webhook/route.ts'),
    'utf8',
  );
  assert(!saas.includes('master_corporate_asaas'), 'SaaS webhook intacto');
  assert(!company.includes('master_corporate_asaas'), 'company webhook intacto');
  assert(
    fs.existsSync(
      path.join(root, 'docs/master-corporate-finance-asaas-fase7.md'),
    ),
    'doc homologação',
  );
}

function main() {
  console.log('=== Fase 7.6 Asaas suite ===');
  run('scripts/mandatory-master-corporate-finance-asaas-foundation-tests.ts');
  run('scripts/mandatory-master-corporate-finance-asaas-charges-tests.ts');
  run('scripts/mandatory-master-corporate-finance-asaas-webhook-tests.ts');
  run('scripts/mandatory-master-corporate-finance-asaas-ui-tests.ts');
  run('scripts/mandatory-master-corporate-finance-asaas-reconcile-tests.ts');
  run('scripts/mandatory-master-corporate-finance-asaas-create-no-settle-tests.ts');
  run('scripts/mandatory-master-corporate-finance-asaas-list-actions-tests.ts');
  isolationGates();
  console.log('OK isolation gates');
  console.log('ALL PASS');
}

main();
