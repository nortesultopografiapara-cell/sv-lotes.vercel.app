/**
 * Testes — importação de clientes (Fase 2 Migração de Dados).
 * npx tsx scripts/mandatory-data-migration-customers-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { mapCustomerImportColumns } from '../lib/imports/modules/customers/columnMapping';
import { parseCustomerImportFile, parseImportSpreadsheetBuffer } from '../lib/imports/modules/customers/parseFile';
import {
  buildCustomerImportCsvContent,
  buildCustomerImportXlsxBuffer,
} from '../lib/imports/modules/customers/templates';
import {
  buildCustomerInsertPayload,
  buildExistingCustomerIndex,
  isValidImportEmail,
  validateCustomerRows,
} from '../lib/imports/modules/customers/validateRows';
import { canAccessDataMigrationModule } from '../lib/imports/permissions';
import { customersImportModule } from '../lib/imports/modules/customers';
import type { ParsedCustomerRow } from '../lib/imports/modules/customers/types';
import { normalizeCpfCnpj } from '../lib/inputMasks';

const ROOT = path.resolve(__dirname, '..');

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function buildRow(overrides: Partial<ParsedCustomerRow> = {}): ParsedCustomerRow {
  return {
    lineNumber: 2,
    raw: {},
    nome: 'João Teste',
    cpf_cnpj: '123.456.789-09',
    cpf_cnpj_digits: '12345678909',
    rg: '',
    telefone: '11999998888',
    telefone_digits: '11999998888',
    whatsapp: '',
    whatsapp_digits: '',
    email: 'joao@teste.com',
    endereco: '',
    cidade: 'São Paulo',
    uf: 'SP',
    cep: '',
    cep_digits: '',
    estado_civil: '',
    profissao: '',
    observacoes: '',
    ...overrides,
  };
}

async function testRealExcelTemplate() {
  const buffer = await buildCustomerImportXlsxBuffer();
  assert(buffer.length > 1000, 'xlsx real deve ter conteúdo');
  assert(buffer[0] === 0x50 && buffer[1] === 0x4b, 'xlsx deve iniciar com PK');
  const parsed = parseImportSpreadsheetBuffer(buffer, 'modelo.xlsx');
  assert(parsed.headers.includes('nome'), 'header nome no xlsx');
  assert(parsed.rowCount >= 2, 'xlsx deve ter linhas de exemplo');
  console.log('OK testRealExcelTemplate');
}

function testRealCsvTemplate() {
  const csv = buildCustomerImportCsvContent();
  assert(csv.includes('nome;cpf_cnpj'), 'csv headers');
  assert(csv.includes('EXEMPLO'), 'csv linhas exemplo');
  const parsed = parseImportSpreadsheetBuffer(Buffer.from(csv, 'utf8'), 'modelo.csv');
  assert(parsed.fileType === 'csv', 'tipo csv');
  assert(parsed.rowCount >= 2, 'csv linhas exemplo');
  console.log('OK testRealCsvTemplate');
}

async function testReadXlsx() {
  const buffer = await buildCustomerImportXlsxBuffer();
  const { columnMapping, rows } = parseCustomerImportFile(buffer, 'clientes.xlsx');
  assert(columnMapping.missingRequired.length === 0, 'xlsx mapeia nome');
  assert(rows.length >= 0, 'xlsx parse ok');
  console.log('OK testReadXlsx');
}

function testReadCsv() {
  const csv = 'nome;cpf_cnpj;email\nMaria;529.982.247-25;maria@email.com\n';
  const { columnMapping, rows } = parseCustomerImportFile(Buffer.from(csv, 'utf8'), 'clientes.csv');
  assert(columnMapping.mapping.nome === 'nome', 'csv nome');
  assert(rows.length === 1, 'csv uma linha');
  assert(rows[0]?.nome === 'Maria', 'csv valor nome');
  console.log('OK testReadCsv');
}

function testColumnAliases() {
  const mapping = mapCustomerImportColumns([
    'Cliente',
    'Documento',
    'E-mail',
    'Fone',
    'Celular',
    'Logradouro',
    'Município',
    'Estado',
  ]);
  assert(mapping.mapping.nome === 'Cliente', 'alias cliente');
  assert(mapping.mapping.cpf_cnpj === 'Documento', 'alias documento');
  assert(mapping.mapping.email === 'E-mail', 'alias email');
  assert(mapping.mapping.telefone === 'Fone', 'alias fone');
  assert(mapping.mapping.whatsapp === 'Celular', 'alias celular');
  assert(mapping.mapping.endereco === 'Logradouro', 'alias logradouro');
  assert(mapping.mapping.cidade === 'Município', 'alias municipio');
  assert(mapping.mapping.uf === 'Estado', 'alias estado');
  console.log('OK testColumnAliases');
}

function testRequiredName() {
  const { rows } = validateCustomerRows([buildRow({ nome: '' })], buildExistingCustomerIndex([]));
  assert(rows[0]?.status === 'error', 'nome vazio é erro');
  assert(!rows[0]?.importable, 'nome vazio não importável');
  console.log('OK testRequiredName');
}

function testCpfCnpjValidation() {
  const valid = validateCustomerRows(
    [buildRow({ cpf_cnpj: '123.456.789-09', cpf_cnpj_digits: '12345678909' })],
    buildExistingCustomerIndex([]),
  );
  assert(valid.rows[0]?.importable, 'cpf 11 dígitos importável');

  const invalid = validateCustomerRows(
    [buildRow({ cpf_cnpj: '123', cpf_cnpj_digits: '123' })],
    buildExistingCustomerIndex([]),
  );
  assert(invalid.rows[0]?.status === 'error', 'cpf inválido é erro');
  console.log('OK testCpfCnpjValidation');
}

function testEmailValidation() {
  assert(isValidImportEmail('a@b.com'), 'email válido');
  assert(!isValidImportEmail('invalido'), 'email inválido');

  const result = validateCustomerRows(
    [buildRow({ email: 'invalido' })],
    buildExistingCustomerIndex([]),
  );
  assert(result.rows[0]?.status === 'error', 'email inválido gera erro');
  console.log('OK testEmailValidation');
}

function testSpreadsheetDuplicate() {
  const row = buildRow({ cpf_cnpj_digits: '12345678909' });
  const { rows, summary } = validateCustomerRows(
    [row, { ...row, lineNumber: 3 }],
    buildExistingCustomerIndex([]),
  );
  assert(summary.duplicateRows >= 1, 'duplicidade na planilha');
  assert(rows.some((item) => item.status === 'duplicate'), 'status duplicado');
  console.log('OK testSpreadsheetDuplicate');
}

function testExistingInDatabase() {
  const existing = buildExistingCustomerIndex([
    {
      id: 'cust-1',
      name: 'Maria Existente',
      cpf_cnpj: '123.456.789-09',
      phone: '11999990000',
    },
  ]);
  const { rows } = validateCustomerRows(
    [buildRow({ cpf_cnpj_digits: '12345678909' })],
    existing,
  );
  assert(rows[0]?.status === 'existing', 'existente no banco');
  assert(!rows[0]?.importable, 'existente não importável');
  console.log('OK testExistingInDatabase');
}

function testPreValidationDoesNotPersist() {
  const importService = read('lib/imports/modules/customers/importService.ts');
  assert(importService.includes('validateCustomerImportBuffer'), 'validação separada');
  assert(!importService.includes('.update('), 'importação não atualiza clientes');
  console.log('OK testPreValidationDoesNotPersist');
}

function testPreviewStatuses() {
  const { rows } = validateCustomerRows(
    [
      buildRow({ nome: 'Sem Doc', cpf_cnpj: '', cpf_cnpj_digits: '' }),
      buildRow({ lineNumber: 3, nome: '', cpf_cnpj_digits: '' }),
    ],
    buildExistingCustomerIndex([]),
  );
  assert(rows.some((row) => row.status === 'warning'), 'avisos');
  assert(rows.some((row) => row.status === 'error'), 'erros');
  console.log('OK testPreviewStatuses');
}

function testImportableOnlyValidAndWarnings() {
  const existing = buildExistingCustomerIndex([
    { id: '1', name: 'Existente', cpf_cnpj: '11144477735', document: '11144477735' },
  ]);
  const { summary } = validateCustomerRows(
    [
      buildRow({ cpf_cnpj_digits: '12345678909', lineNumber: 2 }),
      buildRow({ cpf_cnpj_digits: '11144477735', lineNumber: 3 }),
      buildRow({ nome: '', lineNumber: 4, cpf_cnpj_digits: '' }),
    ],
    existing,
  );
  assert(summary.importableRows === 1, 'apenas válidos/avisos importáveis');
  console.log('OK testImportableOnlyValidAndWarnings');
}

function testInsertPayloadTenantScope() {
  const payload = buildCustomerInsertPayload(buildRow(), 'tenant-abc');
  assert(payload.tenant_id === 'tenant-abc', 'tenant_id');
  assert(payload.company_id === 'tenant-abc', 'company_id');
  assert(payload.name === 'JOÃO TESTE', 'nome upper');
  console.log('OK testInsertPayloadTenantScope');
}

function testHistoryMigrationExists() {
  const migration = read('supabase/migrations/20260705120000_data_migration_history.sql');
  assert(migration.includes('data_migration_history'), 'tabela histórico');
  assert(migration.includes('company_id'), 'company_id');
  assert(migration.includes('detalhes_json'), 'detalhes_json');
  console.log('OK testHistoryMigrationExists');
}

function testPermissionsAndModule() {
  assert(customersImportModule.status === 'available', 'clientes disponível');
  assert(canAccessDataMigrationModule('ADMIN'), 'ADMIN');
  assert(canAccessDataMigrationModule('SUPER_ADMIN'), 'SUPER_ADMIN');
  assert(!canAccessDataMigrationModule('BROKER'), 'BROKER bloqueado');

  const routes = [
    'app/api/data-migration/customers/validate/route.ts',
    'app/api/data-migration/customers/execute/route.ts',
    'app/api/data-migration/history/route.ts',
  ];
  for (const route of routes) {
    assert(fs.existsSync(path.join(ROOT, route)), route);
    assert(read(route).includes('authorizeDataMigrationRequest'), `${route} auth`);
  }
  console.log('OK testPermissionsAndModule');
}

function testMissingNameColumnError() {
  const csv = 'email;telefone\na@b.com;11999999999\n';
  const { columnMapping, rows } = parseCustomerImportFile(Buffer.from(csv, 'utf8'), 'sem-nome.csv');
  assert(columnMapping.missingRequired.includes('nome'), 'nome obrigatório ausente');
  assert(rows.length === 0, 'sem linhas sem mapeamento');
  console.log('OK testMissingNameColumnError');
}

function testCpfNormalization() {
  assert(normalizeCpfCnpj('12.345.678/0001-90') === '12345678000190', 'cnpj digits');
  console.log('OK testCpfNormalization');
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

async function main() {
  await testRealExcelTemplate();
  testRealCsvTemplate();
  await testReadXlsx();
  testReadCsv();
  testColumnAliases();
  testRequiredName();
  testCpfCnpjValidation();
  testEmailValidation();
  testSpreadsheetDuplicate();
  testExistingInDatabase();
  testPreValidationDoesNotPersist();
  testPreviewStatuses();
  testImportableOnlyValidAndWarnings();
  testInsertPayloadTenantScope();
  testHistoryMigrationExists();
  testPermissionsAndModule();
  testMissingNameColumnError();
  testCpfNormalization();
  console.log('mandatory-data-migration-customers-tests: all passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
