/**
 * Testes — importação de corretores (Migração de Dados).
 * npm run test:data-migration-brokers
 */

import fs from 'node:fs';
import path from 'node:path';
import { brokersImportModule } from '../lib/imports/modules/brokers';
import {
  buildBrokerImportXlsxBuffer,
  buildBrokerImportXlsxBufferWithRealTestRow,
} from '../lib/imports/modules/brokers/templates';
import { validateBrokerImportBuffer } from '../lib/imports/modules/brokers/importService';
import {
  buildExistingBrokerIndex,
  isValidImportEmail,
  validateBrokerRows,
} from '../lib/imports/modules/brokers/validateRows';
import {
  parseBrokerActiveFlag,
  parseBrokerCommissionPercent,
} from '../lib/imports/modules/brokers/normalize';
import type { ParsedBrokerRow } from '../lib/imports/modules/brokers/types';
import {
  applyBrokerValidationAndAdvance,
  INITIAL_MIGRATION_WIZARD_STATE,
} from '../lib/imports/services/migrationWizardState';

const ROOT = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function buildRow(overrides: Partial<ParsedBrokerRow> = {}): ParsedBrokerRow {
  return {
    lineNumber: 2,
    raw: {},
    nome: 'João Corretor',
    cpf_cnpj: '529.982.247-25',
    cpf_cnpj_digits: '52998224725',
    telefone: '11999998888',
    telefone_digits: '11999998888',
    whatsapp: '',
    whatsapp_digits: '',
    email: 'joao@corretor.com',
    email_normalized: 'JOAO@CORRETOR.COM',
    percentual_comissao_raw: '5',
    percentual_comissao: 5,
    observacoes: '',
    ativo_raw: 'SIM',
    ativo: true,
    ...overrides,
  };
}

async function test1EmptyTemplateIgnoresExamples() {
  const buffer = await buildBrokerImportXlsxBuffer();
  const validation = await validateBrokerImportBuffer(
    buffer,
    'modelo_migracao_corretores.xlsx',
    [],
  );
  assert(validation.summary.totalRows === 0, 'exemplos não contam como linhas reais');
  assert(validation.rowCount >= 2, 'arquivo contém linhas de exemplo');
  console.log('OK test1EmptyTemplateIgnoresExamples');
}

async function test2TemplateWithOneRealRow() {
  const buffer = await buildBrokerImportXlsxBufferWithRealTestRow();
  const validation = await validateBrokerImportBuffer(
    buffer,
    'modelo_migracao_corretores.xlsx',
    [],
  );
  assert(validation.summary.totalRows === 1, 'totalRows = 1 linha real');
  assert(validation.rows.length === 1, 'uma linha na pré-validação');
  assert(validation.rows[0]?.nome === 'Corretor Real Teste', 'linha real presente');
  console.log('OK test2TemplateWithOneRealRow');
}

function test3InvalidCpfRowError() {
  const { rows, summary } = validateBrokerRows(
    [buildRow({ cpf_cnpj: '123', cpf_cnpj_digits: '123' })],
    buildExistingBrokerIndex([]),
  );
  assert(summary.errorRows === 1, 'cpf inválido vira erro de linha');
  assert(rows[0]?.status === 'error', 'status erro');
  console.log('OK test3InvalidCpfRowError');
}

function test4InvalidEmailRowError() {
  assert(!isValidImportEmail('invalido'), 'email inválido');
  const { rows } = validateBrokerRows(
    [buildRow({ email: 'invalido', email_normalized: 'INVALIDO' })],
    buildExistingBrokerIndex([]),
  );
  assert(rows[0]?.status === 'error', 'email inválido gera erro de linha');
  console.log('OK test4InvalidEmailRowError');
}

function test5CommissionPercentSymbol() {
  const parsed = parseBrokerCommissionPercent('5%');
  assert(parsed.value === 5, '5% normaliza para 5');
  const { rows } = validateBrokerRows(
    [buildRow({ percentual_comissao_raw: '5%', percentual_comissao: 5 })],
    buildExistingBrokerIndex([]),
  );
  assert(rows[0]?.percentual_comissao === 5, 'linha validada com 5%');
  console.log('OK test5CommissionPercentSymbol');
}

function test6CommissionCommaDecimal() {
  const parsed = parseBrokerCommissionPercent('5,5');
  assert(parsed.value === 5.5, '5,5 normaliza para 5.5');
  const { rows } = validateBrokerRows(
    [buildRow({ percentual_comissao_raw: '5,5', percentual_comissao: 5.5 })],
    buildExistingBrokerIndex([]),
  );
  assert(rows[0]?.percentual_comissao === 5.5, 'linha validada com 5,5');
  console.log('OK test6CommissionCommaDecimal');
}

function test7ActiveNoNormalizesFalse() {
  const parsed = parseBrokerActiveFlag('não');
  assert(parsed.value === false, 'não normaliza para false');
  const { rows } = validateBrokerRows(
    [buildRow({ ativo_raw: 'não', ativo: false })],
    buildExistingBrokerIndex([]),
  );
  assert(rows[0]?.ativo === false, 'ativo false na linha validada');
  console.log('OK test7ActiveNoNormalizesFalse');
}

function test8SpreadsheetDuplicate() {
  const row = buildRow({ cpf_cnpj_digits: '52998224725' });
  const { rows, summary } = validateBrokerRows(
    [row, { ...row, lineNumber: 3 }],
    buildExistingBrokerIndex([]),
  );
  assert(summary.duplicateRows >= 1, 'duplicidade na planilha');
  assert(rows.some((item) => item.status === 'duplicate'), 'status duplicado');
  console.log('OK test8SpreadsheetDuplicate');
}

function test9ExistingBrokerIgnored() {
  const existing = buildExistingBrokerIndex([
    {
      id: 'broker-1',
      name: 'Maria Existente',
      cpf: '529.982.247-25',
      email: 'maria@email.com',
      phone: '11999990000',
    },
  ]);
  const { rows } = validateBrokerRows(
    [buildRow({ cpf_cnpj_digits: '52998224725' })],
    existing,
  );
  assert(rows[0]?.status === 'existing', 'existente no banco');
  assert(!rows[0]?.importable, 'existente não importável');
  console.log('OK test9ExistingBrokerIgnored');
}

function test10ModuleRoutesAndWizard() {
  assert(brokersImportModule.status === 'available', 'corretores disponível');
  assert(brokersImportModule.enabled, 'corretores habilitado');

  const routes = [
    'app/api/data-migration/brokers/validate/route.ts',
    'app/api/data-migration/brokers/execute/route.ts',
  ];
  for (const route of routes) {
    assert(fs.existsSync(path.join(ROOT, route)), route);
    assert(read(route).includes('authorizeDataMigrationRequest'), `${route} auth`);
  }

  const wizard = read('components/imports/DataMigrationWizard.tsx');
  assert(wizard.includes('applyBrokerValidationAndAdvance'), 'wizard usa helper corretores');
  assert(wizard.includes('/api/data-migration/brokers/validate'), 'chama API validate');
  assert(wizard.includes('/api/data-migration/brokers/execute'), 'chama API execute');

  const importService = read('lib/imports/modules/brokers/importService.ts');
  assert(!importService.includes('.update('), 'importação não atualiza corretores');

  const validateSource = read('lib/imports/modules/brokers/validateRows.ts');
  assert(validateSource.includes('isValidBrazilianTaxDocument'), 'usa isValidBrazilianTaxDocument');
  assert(!validateSource.includes("from '@/lib/customerIdentity'"), 'sem customerIdentity');

  const advanced = applyBrokerValidationAndAdvance(
    {
      ...INITIAL_MIGRATION_WIZARD_STATE,
      step: 'upload',
      selectedModuleId: 'brokers',
      validating: true,
    },
    {
      fileName: 'test.xlsx',
      fileType: 'xlsx',
      rowCount: 0,
      columnMapping: {
        mapping: { nome: 'nome' },
        unmappedHeaders: [],
        missingRequired: [],
        recognizedHeaders: { nome: 'nome' },
      },
      summary: {
        totalRows: 0,
        validRows: 0,
        warningRows: 0,
        errorRows: 0,
        duplicateRows: 0,
        existingRows: 0,
        ignoredRows: 0,
        importableRows: 0,
      },
      rows: [],
    },
  );
  assert(advanced.step === 'pre-validation', 'avanço pós-validação corretores');
  console.log('OK test10ModuleRoutesAndWizard');
}

async function main() {
  await test1EmptyTemplateIgnoresExamples();
  await test2TemplateWithOneRealRow();
  test3InvalidCpfRowError();
  test4InvalidEmailRowError();
  test5CommissionPercentSymbol();
  test6CommissionCommaDecimal();
  test7ActiveNoNormalizesFalse();
  test8SpreadsheetDuplicate();
  test9ExistingBrokerIgnored();
  test10ModuleRoutesAndWizard();
  console.log('mandatory-data-migration-brokers-tests: all passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
