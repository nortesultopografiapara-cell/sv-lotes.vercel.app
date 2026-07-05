/**
 * Testes — importação de vendas (Migração de Dados).
 * npm run test:data-migration-sales
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseSaleImportCurrency, parseSaleImportDate } from '../lib/imports/modules/sales/normalize';
import {
  buildSalesBlockIndex,
  buildSalesBrokerIndex,
  buildSalesCustomerIndex,
  buildSalesProjectIndex,
} from '../lib/imports/modules/sales/lookupIndex';
import { validateSaleImportBuffer } from '../lib/imports/modules/sales/importService';
import { salesImportModule } from '../lib/imports/modules/sales';
import {
  buildSaleImportXlsxBuffer,
  buildSaleImportXlsxBufferWithRealTestRow,
} from '../lib/imports/modules/sales/templates';
import { buildSaleExecutionExpectation } from '../lib/imports/modules/sales/executeSaleRow';
import {
  buildBlockUpdatePayload,
  buildSaleInsertPayload,
  validateSaleRows,
} from '../lib/imports/modules/sales/validateRows';
import type {
  ParsedSaleRow,
  SalesImportContext,
} from '../lib/imports/modules/sales/types';
import {
  applySalesValidationAndAdvance,
  INITIAL_MIGRATION_WIZARD_STATE,
} from '../lib/imports/services/migrationWizardState';

const ROOT = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function buildMockContext(overrides: Partial<SalesImportContext> = {}): SalesImportContext {
  const customers = buildSalesCustomerIndex([
    {
      id: 'cust-1',
      name: 'Cliente Teste',
      cpf_cnpj: '529.982.247-25',
      email: 'cliente@teste.com',
      phone: '11999998888',
    },
  ]);
  const brokers = buildSalesBrokerIndex([
    {
      id: 'broker-1',
      name: 'Corretor Real Teste',
      cpf: '123.456.789-09',
      email: 'corretor@teste.com',
      commission_percent: 3,
    },
  ]);
  const projects = buildSalesProjectIndex([
    { id: 'proj-1', name: 'Empreendimento Real Teste' },
  ]);
  const blocks = buildSalesBlockIndex([
    {
      id: 'block-1',
      project_id: 'proj-1',
      block_name: 'A',
      number: '99',
      lot_number: '99',
      status: 'Disponível',
      sale_id: null,
      customer_id: null,
      price: 100000,
    },
    {
      id: 'block-sold',
      project_id: 'proj-1',
      block_name: 'B',
      number: '5',
      lot_number: '5',
      status: 'Vendido',
      sale_id: 'sale-old',
      customer_id: 'cust-1',
      price: 90000,
    },
  ]);

  return {
    customers,
    brokers,
    projects,
    blocks,
    activeSaleBlockIds: new Set(['block-sold']),
    ...overrides,
  };
}

function buildRow(overrides: Partial<ParsedSaleRow> = {}): ParsedSaleRow {
  return {
    lineNumber: 4,
    raw: {},
    cliente_cpf_cnpj: '529.982.247-25',
    cliente_cpf_cnpj_digits: '52998224725',
    cliente_email: 'cliente@teste.com',
    cliente_email_normalized: 'CLIENTE@TESTE.COM',
    cliente_telefone: '11999998888',
    cliente_telefone_digits: '11999998888',
    corretor_cpf_cnpj: '',
    corretor_email: '',
    corretor_nome: 'Corretor Real Teste',
    corretor_cpf_cnpj_digits: '',
    corretor_email_normalized: '',
    corretor_nome_normalized: 'CORRETOR REAL TESTE',
    empreendimento: 'Empreendimento Real Teste',
    empreendimento_normalized: 'EMPREENDIMENTO REAL TESTE',
    quadra: 'A',
    quadra_normalized: 'A',
    lote: '99',
    lote_normalized: '99',
    data_venda_raw: '10/06/2025',
    data_venda: '2025-06-10',
    valor_total_raw: 'R$ 100.000,00',
    valor_total: 100000,
    entrada_raw: 'R$ 20.000,00',
    entrada: 20000,
    sinal_raw: '',
    sinal: 0,
    saldo_raw: '',
    saldo: 80000,
    quantidade_parcelas_raw: '80',
    quantidade_parcelas: 80,
    vencimento_primeira_parcela_raw: '10/07/2025',
    vencimento_primeira_parcela: '2025-07-10',
    percentual_comissao_raw: '5%',
    percentual_comissao: 5,
    status_raw: 'VENDIDO',
    status_normalized: 'VENDIDO',
    observacoes: '',
    ...overrides,
  };
}

async function test1EmptyTemplateIgnoresExamples() {
  const buffer = await buildSaleImportXlsxBuffer();
  const validation = await validateSaleImportBuffer(
    buffer,
    'modelo_migracao_vendas.xlsx',
    buildMockContext(),
  );
  assert(validation.summary.totalRows === 0, 'exemplos não contam');
  assert(validation.rowCount >= 2, 'arquivo tem exemplos');
  console.log('OK test1EmptyTemplateIgnoresExamples');
}

async function test2ValidRowLocatesEntities() {
  const { rows, summary } = validateSaleRows([buildRow()], buildMockContext());
  assert(summary.totalRows === 1, 'totalRows = 1');
  assert(rows[0]?.customer_id === 'cust-1', 'cliente localizado');
  assert(rows[0]?.broker_id === 'broker-1', 'corretor localizado');
  assert(rows[0]?.project_id === 'proj-1', 'projeto localizado');
  assert(rows[0]?.block_id === 'block-1', 'lote localizado');

  const buffer = await buildSaleImportXlsxBufferWithRealTestRow();
  const validation = await validateSaleImportBuffer(
    buffer,
    'modelo_migracao_vendas.xlsx',
    buildMockContext(),
  );
  assert(validation.summary.totalRows === 1, 'xlsx totalRows = 1');
  assert(validation.rowCount >= 3, 'xlsx tem exemplos + real');
  console.log('OK test2ValidRowLocatesEntities');
}

function test3CustomerNotFound() {
  const { rows } = validateSaleRows(
    [buildRow({ cliente_cpf_cnpj_digits: '11144477735', cliente_email_normalized: '', cliente_telefone_digits: '' })],
    buildMockContext(),
  );
  assert(rows[0]?.status === 'error', 'cliente não encontrado');
  assert(rows[0]?.messages.some((m) => m.text.includes('Cliente não localizado')), 'msg cliente');
  console.log('OK test3CustomerNotFound');
}

function test4BrokerNotFound() {
  const { rows } = validateSaleRows(
    [buildRow({ corretor_nome_normalized: 'INEXISTENTE', corretor_cpf_cnpj_digits: '', corretor_email_normalized: '' })],
    buildMockContext(),
  );
  assert(rows[0]?.status === 'error', 'corretor não encontrado');
  console.log('OK test4BrokerNotFound');
}

function test5ProjectNotFound() {
  const { rows } = validateSaleRows(
    [buildRow({ empreendimento_normalized: 'NAO EXISTE', empreendimento: 'Nao Existe' })],
    buildMockContext(),
  );
  assert(rows[0]?.status === 'error', 'projeto não encontrado');
  console.log('OK test5ProjectNotFound');
}

function test6BlockNotFound() {
  const { rows } = validateSaleRows(
    [buildRow({ lote: '777', lote_normalized: '777' })],
    buildMockContext(),
  );
  assert(rows[0]?.status === 'error', 'lote não encontrado');
  console.log('OK test6BlockNotFound');
}

function test7OccupiedBlockIgnored() {
  const { rows } = validateSaleRows(
    [buildRow({ quadra: 'B', quadra_normalized: 'B', lote: '5', lote_normalized: '5' })],
    buildMockContext(),
  );
  assert(rows[0]?.status === 'existing', 'lote ocupado');
  assert(!rows[0]?.importable, 'não importável');
  console.log('OK test7OccupiedBlockIgnored');
}

function test8CurrencyNormalization() {
  const parsed = parseSaleImportCurrency('R$ 100.000,00');
  assert(parsed.value === 100000, 'moeda normalizada');
  console.log('OK test8CurrencyNormalization');
}

function test9DateNormalization() {
  const parsed = parseSaleImportDate('15/03/2025');
  assert(parsed.value === '2025-03-15', 'data brasileira');
  console.log('OK test9DateNormalization');
}

function test10SpreadsheetDuplicateBlock() {
  const row = buildRow();
  const { rows, summary } = validateSaleRows([row, { ...row, lineNumber: 5 }], buildMockContext());
  assert(summary.duplicateRows >= 1, 'duplicidade detectada');
  assert(rows.some((item) => item.status === 'duplicate'), 'status duplicado');
  console.log('OK test10SpreadsheetDuplicateBlock');
}

function test11ExecutionPayloads() {
  const { rows } = validateSaleRows([buildRow()], buildMockContext());
  const row = rows[0];
  assert(row?.importable, 'linha importável');

  const expectation = buildSaleExecutionExpectation(row!);
  assert(expectation.createsSale, 'cria venda');
  assert(expectation.createsFinanceReceipts, 'cria parcelas');
  assert(expectation.blockUpdate.status === 'Vendido', 'lote vendido');

  const salePayload = buildSaleInsertPayload(row!, 'tenant-1', 'user-1');
  assert(salePayload.customer_id === 'cust-1', 'sale customer');
  assert(salePayload.block_id === 'block-1', 'sale block');
  assert(salePayload.total_value === 100000, 'sale value');

  const blockPayload = buildBlockUpdatePayload(row!);
  assert(blockPayload.status === 'Vendido', 'block status');
  console.log('OK test11ExecutionPayloads');
}

function test12ModuleAndRoutes() {
  assert(salesImportModule.status === 'available', 'vendas disponível');
  const routes = [
    'app/api/data-migration/sales/validate/route.ts',
    'app/api/data-migration/sales/execute/route.ts',
  ];
  for (const route of routes) {
    assert(fs.existsSync(path.join(ROOT, route)), route);
    assert(read(route).includes('authorizeDataMigrationRequest'), `${route} auth`);
  }

  const wizard = read('components/imports/DataMigrationWizard.tsx');
  assert(wizard.includes('applySalesValidationAndAdvance'), 'wizard vendas');
  assert(wizard.includes('/api/data-migration/sales/validate'), 'api validate');

  const advanced = applySalesValidationAndAdvance(
    {
      ...INITIAL_MIGRATION_WIZARD_STATE,
      step: 'upload',
      selectedModuleId: 'sales',
      validating: true,
    },
    {
      fileName: 'test.xlsx',
      fileType: 'xlsx',
      rowCount: 0,
      columnMapping: {
        mapping: { empreendimento: 'empreendimento' },
        unmappedHeaders: [],
        missingRequired: [],
        recognizedHeaders: { empreendimento: 'empreendimento' },
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
  assert(advanced.step === 'pre-validation', 'avanço pós-validação');
  console.log('OK test12ModuleAndRoutes');
}

async function main() {
  await test1EmptyTemplateIgnoresExamples();
  await test2ValidRowLocatesEntities();
  test3CustomerNotFound();
  test4BrokerNotFound();
  test5ProjectNotFound();
  test6BlockNotFound();
  test7OccupiedBlockIgnored();
  test8CurrencyNormalization();
  test9DateNormalization();
  test10SpreadsheetDuplicateBlock();
  test11ExecutionPayloads();
  test12ModuleAndRoutes();
  console.log('mandatory-data-migration-sales-tests: all passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
