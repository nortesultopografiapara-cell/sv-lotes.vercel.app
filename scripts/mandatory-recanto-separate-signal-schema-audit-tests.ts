/**
 * Auditoria local da sonda de schema do sinal separado.
 * Não abre banco e não executa a migration.
 * npx tsx scripts/mandatory-recanto-separate-signal-schema-audit-tests.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RECANTO_SEPARATE_SIGNAL_ENABLED } from '../lib/recantoSeparateSignalForm';
import {
  RECANTO_SEPARATE_SIGNAL_PERSIST_ENABLED,
  RECANTO_SEPARATE_SIGNAL_SCHEMA_APPLIED,
  assessSeparateSignalSchemaCatalog,
  classifySeparateSignalSchemaProbe,
  type SeparateSignalSchemaCatalog,
} from '../lib/recantoSeparateSignalPersistence';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function compatibleCatalog(): SeparateSignalSchemaCatalog {
  return {
    columns: [
      { table: 'sales', name: 'signal_schedule_mode', dataType: 'text', nullable: true },
      { table: 'sales', name: 'signal_installment_count', dataType: 'integer', nullable: true },
      { table: 'sales', name: 'signal_first_due_date', dataType: 'date', nullable: true },
      { table: 'sales', name: 'lot_schedule_start_mode', dataType: 'text', nullable: true },
      { table: 'sales', name: 'lot_schedule_first_due_date', dataType: 'date', nullable: true },
      { table: 'sales', name: 'hold_lot_charges_until_signal_settled', dataType: 'boolean', nullable: true },
      { table: 'sales', name: 'separate_signal_request_key', dataType: 'text', nullable: true },
      { table: 'finance_receipts', name: 'schedule_group', dataType: 'text', nullable: true },
    ],
    constraints: [
      {
        name: 'sales_signal_schedule_mode_check',
        definition: "CHECK ((signal_schedule_mode IS NULL) OR (signal_schedule_mode = ANY (ARRAY['EMBEDDED'::text, 'SEPARATE'::text])))",
      },
      {
        name: 'sales_lot_schedule_start_mode_check',
        definition: "CHECK ((lot_schedule_start_mode IS NULL) OR (lot_schedule_start_mode = ANY (ARRAY['AFTER_SIGNAL'::text, 'SIMULTANEOUS'::text, 'SPECIFIC_DATE'::text])))",
      },
      {
        name: 'sales_separate_signal_without_embedded_mode_check',
        definition: "CHECK ((signal_schedule_mode IS DISTINCT FROM 'SEPARATE'::text) OR ((signal_remaining_payment_mode IS NULL) AND (signal_remaining_installments IS NULL) AND (signal_remaining_installment_value IS NULL) AND (tenant_id IS NOT NULL) AND (company_id IS NOT DISTINCT FROM tenant_id) AND (separate_signal_request_key IS NOT NULL)))",
      },
      {
        name: 'finance_receipts_schedule_group_check',
        definition: "CHECK ((schedule_group IS NULL) OR (schedule_group = ANY (ARRAY['SIGNAL'::text, 'LOT'::text])))",
      },
      {
        name: 'finance_receipts_separate_lot_without_signal_addon_check',
        definition: "CHECK ((schedule_group IS DISTINCT FROM 'LOT'::text) OR (signal_addon_amount IS NULL) OR (signal_addon_amount = (0)::numeric))",
      },
      {
        name: 'finance_receipts_separate_signal_without_addon_check',
        definition: "CHECK ((schedule_group IS DISTINCT FROM 'SIGNAL'::text) OR (signal_addon_amount IS NULL) OR (signal_addon_amount = (0)::numeric))",
      },
    ],
    indexes: [
      {
        name: 'finance_receipts_sale_group_installment_uidx',
        unique: true,
        valid: true,
        definition: 'CREATE UNIQUE INDEX finance_receipts_sale_group_installment_uidx ON public.finance_receipts USING btree (sale_id, schedule_group, installment_number)',
        predicate: '(schedule_group IS NOT NULL)',
      },
      {
        name: 'sales_separate_signal_request_key_uidx',
        unique: true,
        valid: true,
        definition: 'CREATE UNIQUE INDEX sales_separate_signal_request_key_uidx ON public.sales USING btree (tenant_id, separate_signal_request_key)',
        predicate: '(separate_signal_request_key IS NOT NULL)',
      },
    ],
    receiptUniqueIndexes: [
      {
        name: 'finance_receipts_pkey',
        unique: true,
        valid: true,
        definition: 'CREATE UNIQUE INDEX finance_receipts_pkey ON public.finance_receipts USING btree (id)',
        predicate: null,
      },
    ],
  };
}

function main() {
  assert(RECANTO_SEPARATE_SIGNAL_SCHEMA_APPLIED === false, 'flag de schema ligada');
  assert(RECANTO_SEPARATE_SIGNAL_PERSIST_ENABLED === false, 'gravação ligada');
  assert(RECANTO_SEPARATE_SIGNAL_ENABLED === false, 'formulário ligado');

  assert(assessSeparateSignalSchemaCatalog({ columns: [], constraints: [], indexes: [] }).status === 'NOT_MIGRATED', 'vazio não é antigo');
  const columnOnly = classifySeparateSignalSchemaProbe({ columnSeen: true });
  assert(columnOnly.status === 'UNEXPECTED', 'coluna isolada aceita');
  if (columnOnly.status === 'UNEXPECTED') {
    assert(columnOnly.safeMessage.includes('compatibilidade integral'), columnOnly.safeMessage);
  }

  const compatible = classifySeparateSignalSchemaProbe({ catalog: compatibleCatalog() });
  assert(compatible.status === 'MIGRATED', compatible.status === 'UNEXPECTED' ? compatible.safeMessage : 'catálogo compatível recusado');

  const partial = assessSeparateSignalSchemaCatalog({
    columns: [{ table: 'finance_receipts', name: 'schedule_group', dataType: 'text', nullable: true }],
    constraints: [],
    indexes: [],
  });
  assert(partial.status === 'UNEXPECTED', 'schema parcial tratado como ausente');

  const conflict = compatibleCatalog();
  conflict.receiptUniqueIndexes = [
    {
      name: 'finance_receipts_sale_installment_uidx',
      unique: true,
      valid: true,
      definition: 'CREATE UNIQUE INDEX finance_receipts_sale_installment_uidx ON public.finance_receipts USING btree (sale_id, installment_number)',
      predicate: null,
    },
  ];
  assert(
    assessSeparateSignalSchemaCatalog(conflict).status === 'UNEXPECTED',
    'índice antigo de parcela foi aceito',
  );

  const requiredNotNull = compatibleCatalog();
  requiredNotNull.columns = requiredNotNull.columns.map((column) =>
    column.name === 'schedule_group' ? { ...column, nullable: false } : column,
  );
  assert(assessSeparateSignalSchemaCatalog(requiredNotNull).status === 'UNEXPECTED', 'coluna obrigatória aceita');

  const audit = readFileSync(
    resolve(process.cwd(), 'scripts/develop/audit-recanto-separate-signal-schema.ts'),
    'utf8',
  );
  assert(audit.includes('begin read only'), 'auditoria sem transação somente leitura');
  assert(audit.includes('DEVELOP_PROJECT_REF'), 'auditoria sem o ref Develop');
  assert(audit.includes('PRODUCTION_PROJECT_REF'), 'auditoria sem o bloqueio de Production');
  assert(audit.includes('dbRef !== DEVELOP_PROJECT_REF'), 'auditoria aceitaria outro projeto');
  assert(!/db push|migration repair|readFileSync\([^)]*20261105143000/i.test(audit), 'auditoria reexecutaria a migration');
  const statements = audit.match(/const (AUDIT_SQL|HISTORY_SQL) = `[\s\S]*?`;/g) ?? [];
  assert(statements.length === 2, 'consultas da auditoria não localizadas');
  for (const statement of statements) {
    assert(/^\s*select\b/i.test(statement.slice(statement.indexOf('`') + 1)), 'consulta não começa com select');
    assert(!/\b(insert|update|delete|alter|drop|create|truncate|grant|revoke)\b/i.test(statement), 'consulta de escrita');
  }

  console.log('Auditoria local do schema do sinal separado: ok.');
}

main();
