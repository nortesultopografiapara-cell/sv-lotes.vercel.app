/**
 * Etapa 1 — testes de estrutura (migrations + script de reclassificação).
 * Não aplica SQL em produção e não executa APPLY.
 *
 * npm run test:master-finance-etapa1-structure
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testTransferTypeMigration() {
  const sql = read(
    'supabase/migrations/20260731120000_saas_cash_transfer_type.sql',
  );
  assert(sql.includes("CHECK (type IN ('income', 'expense', 'transfer'))"), 'type transfer');
  assert(sql.includes('DROP CONSTRAINT IF EXISTS saas_cash_movements_type_check'), 'idempotent drop');
  assert(!/DELETE\s+FROM\s+public\.saas_cash_movements/i.test(sql), 'não apaga movimentos');
  console.log('OK testTransferTypeMigration');
}

function testAccountsBusinessUnitMigration() {
  const sql = read(
    'supabase/migrations/20260731121000_corporate_accounts_business_unit.sql',
  );
  assert(sql.includes('ADD COLUMN IF NOT EXISTS business_unit'), 'coluna business_unit');
  assert(sql.includes("SET business_unit = 'SV_TOPOGRAFIA'"), 'backfill topo');
  assert(sql.includes("CHECK (business_unit IN ('SV_LOTES', 'SV_TOPOGRAFIA'))"), 'check units');
  assert(sql.includes("'Caixa SV Topografia'"), 'seed caixa topo');
  assert(sql.includes("'Asaas SV LOTES'"), 'seed asaas lotes');
  assert(sql.includes("'Caixa SV LOTES'"), 'seed caixa lotes');
  assert(sql.includes('WHERE NOT EXISTS'), 'seed idempotente');
  assert(!/DELETE\s+FROM\s+public\.master_corporate_financial_accounts/i.test(sql), 'não apaga contas');
  console.log('OK testAccountsBusinessUnitMigration');
}

function testReceivablesPayablesBusinessUnitMigration() {
  const sql = read(
    'supabase/migrations/20260731122000_corporate_receivables_payables_business_unit.sql',
  );
  assert(sql.includes('master_corporate_receivables'), 'receivables');
  assert(sql.includes('master_corporate_payables'), 'payables coerência');
  assert(sql.includes("SET business_unit = 'SV_TOPOGRAFIA'"), 'backfill');
  assert(
    sql.includes('idx_master_corporate_receivables_business_unit'),
    'índice AR',
  );
  assert(
    sql.includes('idx_master_corporate_payables_business_unit'),
    'índice AP',
  );
  assert(!/DELETE\s+FROM\s+public\.master_corporate_receivables/i.test(sql), 'não apaga AR');
  assert(!/DELETE\s+FROM\s+public\.master_corporate_payables/i.test(sql), 'não apaga AP');
  console.log('OK testReceivablesPayablesBusinessUnitMigration');
}

function testReclassifyScriptSafety() {
  const src = read('scripts/reclassify-saas-cash-transfers.ts');
  assert(src.includes("APPLY"), 'flag APPLY');
  assert(src.includes('DRY_RUN'), 'modo dry-run');
  assert(src.includes('loadDecryptedVercelProductionEnv'), 'decrypt vercel');
  assert(src.includes('[SENSITIVE]'), 'ignora placeholders');
  assert(src.includes('candidateTotal'), 'total');
  assert(src.includes('movement_date'), 'datas');
  assert(src.includes('description'), 'descrição');
  assert(src.includes('source'), 'source');
  assert(src.includes('rule'), 'regra');
  assert(src.includes('BILL_PAYMENT'), 'exclui bill payment');
  assert(src.includes("type: 'transfer'"), 'update para transfer');
  // APPLY só quando env explícito
  assert(
    /String\(process\.env\.APPLY \|\| ''\)\.toLowerCase\(\) === 'true'/.test(src),
    'APPLY explícito',
  );
  console.log('OK testReclassifyScriptSafety');
}

function main() {
  testTransferTypeMigration();
  testAccountsBusinessUnitMigration();
  testReceivablesPayablesBusinessUnitMigration();
  testReclassifyScriptSafety();
  console.log('\nTodos os testes estruturais da Etapa 1 passaram.');
}

main();
