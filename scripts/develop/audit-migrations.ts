/**
 * Auditoria das migrations do repo — não aplica SQL.
 * npx tsx scripts/develop/audit-migrations.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { FORBIDDEN_MIGRATION } from './guard';

const dir = path.join(__dirname, '..', '..', 'supabase', 'migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

const applyProd = files.filter((f) => f.startsWith('_APPLY_PROD_'));
const rollbacks = files.filter((f) => /ROLLBACK|rollback/i.test(f));
const conceptual = files.filter((f) => /conceptual/i.test(f));
const numbered = files.filter((f) => /^\d{14}_/.test(f));
const forbiddenPresent = files.includes(FORBIDDEN_MIGRATION);

const report = {
  totalSqlFiles: files.length,
  numberedMigrations: numbered.length,
  applyProdManual: applyProd,
  rollbacks,
  conceptual,
  forbiddenMigrationPresent: forbiddenPresent,
  forbiddenMigrationMustNotApply: FORBIDDEN_MIGRATION,
  note: 'Não replayar cegamente. Production foi evoluída via SQL Editor / scripts apply-*. Preferir dump schema-only.',
};

console.log(JSON.stringify(report, null, 2));
