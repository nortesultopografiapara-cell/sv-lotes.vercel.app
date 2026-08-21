/**
 * Fundação ARAGUAIA e-sign V2 — schema + tipos (sem fluxo de envio/PDF).
 * npx tsx scripts/mandatory-araguaia-esign-v2-foundation-tests.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  SALE_SIGNATURE_PARTY_ROLES,
  SALE_SIGNATURE_SINGLETON_ROLES,
  isSaleSignatureSingletonRole,
  isPublicPartyRole,
  saleSignaturePartyRoleLabel,
} from '../lib/saleContractSignaturePartyTypes';

const NEW_MIGRATION =
  'supabase/migrations/20261006140000_contract_signature_parties_araguaia_esign_v2.sql';
const HISTORICAL_MIGRATION =
  'supabase/migrations/20260723140000_contract_signature_parties.sql';

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

function ok(cond: unknown, msg: string) {
  assert.ok(cond, msg);
  console.log('OK', msg);
}

function testHistoricalMigrationUntouched() {
  const sql = read(HISTORICAL_MIGRATION);
  ok(sql.includes("role IN ('BUYER', 'SPOUSE', 'VENDOR')"), 'histórico: CHECK original');
  ok(
    sql.includes('CONSTRAINT contract_signature_parties_unique_role'),
    'histórico: unique_role permanece só no arquivo antigo',
  );
  ok(!sql.includes('INTERVENIENT'), 'histórico: sem INTERVENIENT');
  ok(!sql.includes('WITNESS_1'), 'histórico: sem WITNESS_1');
}

function testNewMigrationRolesAndSafety() {
  ok(fs.existsSync(path.join(process.cwd(), NEW_MIGRATION)), 'migration V2 existe');
  const sql = read(NEW_MIGRATION);

  ok(
    sql.includes('DROP CONSTRAINT IF EXISTS contract_signature_parties_role_check'),
    'drop CHECK role',
  );
  ok(sql.includes("'BUYER'"), 'CHECK BUYER');
  ok(sql.includes("'SPOUSE'"), 'CHECK SPOUSE (outros modelos)');
  ok(sql.includes("'VENDOR'"), 'CHECK VENDOR');
  ok(sql.includes("'INTERVENIENT'"), 'CHECK INTERVENIENT');
  ok(sql.includes("'WITNESS_1'"), 'CHECK WITNESS_1');
  ok(sql.includes("'WITNESS_2'"), 'CHECK WITNESS_2');

  ok(
    sql.includes(
      'DROP CONSTRAINT IF EXISTS contract_signature_parties_unique_role',
    ),
    'remove unique_role se Preview ainda tiver',
  );
  ok(
    !/ADD CONSTRAINT[\s\S]*UNIQUE\s*\(\s*contract_signature_id\s*,\s*role\s*\)/i.test(
      sql,
    ),
    'não recria UNIQUE(contract_signature_id, role) sem predicado',
  );

  ok(!/ADD COLUMN[\s\S]{0,80}party_order/i.test(sql), 'não cria coluna party_order');
  ok(
    !sql.includes(
      'DROP INDEX IF EXISTS public.idx_contract_signature_parties_token_hash',
    ),
    'não dropa token_hash',
  );
  ok(
    !sql.includes(
      'DROP INDEX IF EXISTS public.idx_contract_signature_parties_unique_vendor_cpf',
    ),
    'não dropa unique_vendor_cpf',
  );
  ok(
    !sql.includes(
      'DROP INDEX IF EXISTS public.idx_contract_signature_parties_signature_role',
    ),
    'não dropa signature_role',
  );

  ok(
    sql.includes('DROP INDEX IF EXISTS public.idx_contract_signature_parties_unique_buyer_spouse'),
    'remove unique_buyer_spouse legado',
  );
  ok(
    sql.includes('idx_contract_signature_parties_unique_singleton_roles') &&
      sql.includes("'INTERVENIENT'") &&
      sql.includes('WHERE role IN'),
    'singleton parcial com nome genérico inclui novos papéis',
  );
  ok(
    !sql.includes(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_signature_parties_unique_buyer_spouse',
    ),
    'não recria o nome buyer_spouse',
  );
  ok(
    sql.includes('idx_contract_signature_parties_unique_vendor_cpf'),
    'preserva/garante unique_vendor_cpf',
  );
  ok(
    sql.includes('idx_contract_signature_parties_signature_role'),
    'preserva/garante signature_role',
  );
  ok(!/\bUPDATE\b|\bDELETE\b/i.test(sql), 'sem UPDATE/DELETE de dados');
}

function testTypes() {
  ok(
    SALE_SIGNATURE_PARTY_ROLES.join(',') ===
      'BUYER,SPOUSE,VENDOR,INTERVENIENT,WITNESS_1,WITNESS_2',
    'roles TypeScript',
  );
  ok(
    SALE_SIGNATURE_SINGLETON_ROLES.join(',') ===
      'BUYER,SPOUSE,INTERVENIENT,WITNESS_1,WITNESS_2',
    'singletons sem VENDOR',
  );
  ok(!SALE_SIGNATURE_SINGLETON_ROLES.includes('VENDOR' as never), 'VENDOR não é singleton');
  ok(SALE_SIGNATURE_PARTY_ROLES.includes('SPOUSE'), 'SPOUSE global preservado');

  ok(isSaleSignatureSingletonRole('BUYER'), 'BUYER singleton');
  ok(isSaleSignatureSingletonRole('INTERVENIENT'), 'INTERVENIENT singleton');
  ok(isSaleSignatureSingletonRole('WITNESS_1'), 'WITNESS_1 singleton');
  ok(isSaleSignatureSingletonRole('WITNESS_2'), 'WITNESS_2 singleton');
  ok(!isSaleSignatureSingletonRole('VENDOR'), 'VENDOR não singleton');

  ok(isPublicPartyRole('BUYER') && isPublicPartyRole('SPOUSE'), 'público BUYER/SPOUSE');
  ok(
    !isPublicPartyRole('INTERVENIENT') &&
      !isPublicPartyRole('WITNESS_1') &&
      !isPublicPartyRole('WITNESS_2'),
    'V2 ainda sem link público (etapa posterior)',
  );

  ok(saleSignaturePartyRoleLabel('INTERVENIENT') === 'Interveniente', 'label interveniente');
  ok(saleSignaturePartyRoleLabel('WITNESS_1') === 'Testemunha 1', 'label testemunha 1');
  ok(saleSignaturePartyRoleLabel('WITNESS_2') === 'Testemunha 2', 'label testemunha 2');
  ok(saleSignaturePartyRoleLabel('SPOUSE') === 'Cônjuge anuente', 'label cônjuge intacto');
}

testHistoricalMigrationUntouched();
testNewMigrationRolesAndSafety();
testTypes();
console.log('mandatory-araguaia-esign-v2-foundation-tests: all passed');
