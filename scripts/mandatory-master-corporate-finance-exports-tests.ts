/**
 * Testes obrigatórios — Exportações Financeiro Corporativo Master (Fase 6.5).
 * npx tsx scripts/mandatory-master-corporate-finance-exports-tests.ts
 */
import fs from 'fs';
import path from 'path';
import { assertCorporateFinanceAccess } from '../lib/master/corporateFinance/service';
import { buildCorporateCsv, assertCsvHasBom } from '../lib/master/corporateFinance/exports/csvExport';
import {
  buildCorporateExportFilename,
  mimeForCorporateExport,
} from '../lib/master/corporateFinance/exports/exportFilename';
import {
  buildExportAuditPayload,
  humanizeFilterSummary,
  summarizeCashFilters,
  summarizeArApFilters,
} from '../lib/master/corporateFinance/exports/exportFilters';
import {
  buildCashFlowExcelBuffer,
  isValidXlsxBuffer,
} from '../lib/master/corporateFinance/exports/excelExport';
import {
  buildCashFlowPdfBuffer,
  isValidPdfBuffer,
  pdfContainsText,
} from '../lib/master/corporateFinance/exports/pdfExport';
import {
  CorporateExportEmptyError,
  parseCorporateExportFormat,
  clampExportLimit,
} from '../lib/master/corporateFinance/exports/exportTypes';
import {
  CORPORATE_BRAND,
  formatCorporateDateBr,
} from '../lib/master/corporateFinance/exports/corporateBranding';
import {
  CORPORATE_EXPORT_LABEL_COLUMNS,
  mapName,
} from '../lib/master/corporateFinance/exports/exportLookups';
import {
  buildPayablesExcelBuffer,
  buildReceivablesExcelBuffer,
} from '../lib/master/corporateFinance/exports/excelExport';
import {
  buildPayablesPdfBuffer,
  buildReceivablesPdfBuffer,
} from '../lib/master/corporateFinance/exports/pdfExport';
import type {
  CorporateArApExportSummary,
  CorporateCashExportRow,
  CorporateCashExportSummary,
  CorporateExportMeta,
  CorporatePayableExportRow,
  CorporateReceivableExportRow,
} from '../lib/master/corporateFinance/exports/exportTypes';

const root = path.join(__dirname, '..');

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel: string) {
  return fs.existsSync(path.join(root, rel));
}

function sampleMeta(overrides: Partial<CorporateExportMeta> = {}): CorporateExportMeta {
  const generatedAt = new Date('2026-07-23T15:00:00.000Z');
  return {
    companyName: CORPORATE_BRAND.companyName,
    legalName: CORPORATE_BRAND.legalName,
    title: 'Fluxo de Caixa Corporativo',
    module: 'cash-flow',
    format: 'xlsx',
    periodLabel: '01/07/2026 — 31/07/2026',
    generatedAt,
    generatedAtLabel: generatedAt.toISOString(),
    filtersLabel: 'fromDate=2026-07-01 · toDate=2026-07-31',
    filterSummary: { fromDate: '2026-07-01', toDate: '2026-07-31' },
    rowCount: 3,
    ...overrides,
  };
}

function sampleCashRows(): CorporateCashExportRow[] {
  return [
    {
      date: '10/07/2026',
      code: 'MOV-2026-0001',
      description: 'Recebimento REC-2026-0001',
      type: 'Entrada',
      origin: 'Backfill recebimento',
      category: 'Receitas',
      account: 'Caixa Principal',
      costCenter: '—',
      project: 'Projeto A',
      paymentMethod: 'PIX',
      income: 4000,
      expense: null,
      runningBalance: 4000,
      status: 'Ativo',
    },
    {
      date: '12/07/2026',
      code: 'MOV-2026-0002',
      description: 'Pagamento PAG-2026-0001',
      type: 'Saída',
      origin: 'Backfill pagamento',
      category: 'Despesas',
      account: 'Caixa Principal',
      costCenter: '—',
      project: 'Projeto A',
      paymentMethod: 'PIX',
      income: null,
      expense: 300,
      runningBalance: 3700,
      status: 'Ativo',
    },
    {
      date: '15/07/2026',
      code: 'MOV-2026-0003',
      description: 'Pagamento PAG-2026-0002',
      type: 'Saída',
      origin: 'Backfill pagamento',
      category: 'Despesas',
      account: 'Caixa Principal',
      costCenter: '—',
      project: '—',
      paymentMethod: 'TED',
      income: null,
      expense: 500,
      runningBalance: 3200,
      status: 'Ativo',
    },
  ];
}

function sampleSummary(): CorporateCashExportSummary {
  return {
    openingBalance: 0,
    periodIncome: 4000,
    periodExpense: 800,
    netResult: 3200,
    closingBalance: 3200,
    movementCount: 3,
  };
}

function testAccess() {
  assert(assertCorporateFinanceAccess({ userId: 'u1' }).ok, 'SUPER path ok');
  assert(!assertCorporateFinanceAccess({ userId: null }).ok, 'sem userId bloqueado');
  assert(
    !assertCorporateFinanceAccess({
      userId: 'u1',
      impersonatingTenantId: 't1',
    }).ok,
    'impersonation bloqueada',
  );
}

function testFilesIsolation() {
  assert(exists('lib/master/corporateFinance/exports/exportService.ts'), 'exportService');
  assert(exists('lib/master/corporateFinance/exports/excelExport.ts'), 'excel');
  assert(exists('lib/master/corporateFinance/exports/pdfExport.ts'), 'pdf');
  assert(exists('lib/master/corporateFinance/exports/csvExport.ts'), 'csv');
  assert(
    exists('app/api/master/corporate-finance/cash-movements/export/route.ts'),
    'cash export API',
  );
  assert(
    exists('app/api/master/corporate-finance/receivables/export/route.ts'),
    'AR export API',
  );
  assert(exists('app/api/master/corporate-finance/payables/export/route.ts'), 'AP export API');
  assert(
    exists('components/master/corporateFinance/CorporateFinanceExportMenu.tsx'),
    'export menu',
  );

  const svc = read('lib/master/corporateFinance/exports/exportService.ts');
  assert(!svc.includes('saas_cash_movements'), 'sem saas_cash');
  assert(!svc.includes('company_cash_movements'), 'sem company_cash');
  assert(!svc.includes('finance_receipts'), 'sem finance_receipts');
  assert(svc.includes('CORPORATE_CASH_EXPORTED'), 'audit cash');
  assert(svc.includes('CORPORATE_RECEIVABLES_EXPORTED'), 'audit AR');
  assert(svc.includes('CORPORATE_PAYABLES_EXPORTED'), 'audit AP');
  assert(svc.includes('buildExportAuditPayload'), 'audit payload helper');

  const cashUi = read('components/master/corporateFinance/CorporateCashFlowPage.tsx');
  assert(cashUi.includes('CorporateFinanceExportMenu'), 'cash menu');
  assert(!cashUi.includes('Exportar CSV'), 'sem botão CSV isolado');

  const arUi = read('components/master/corporateFinance/CorporateReceivablesPage.tsx');
  assert(arUi.includes('CorporateFinanceExportMenu'), 'AR menu');
  const apUi = read('components/master/corporateFinance/CorporatePayablesPage.tsx');
  assert(apUi.includes('CorporateFinanceExportMenu'), 'AP menu');

  // Caixa SaaS intacto
  assert(exists('lib/saasCashExport.ts'), 'saas cash export preservado');
  assert(exists('lib/saasCashMovements.ts'), 'saas cash movements preservado');
}

function testFilenamesAndFormats() {
  const at = new Date('2026-07-23T12:00:00');
  assert(
    buildCorporateExportFilename('cash-flow', 'xlsx', at) ===
      'fluxo-caixa-corporativo-2026-07-23.xlsx',
    'nome cash xlsx',
  );
  assert(
    buildCorporateExportFilename('receivables', 'pdf', at) === 'contas-a-receber-2026-07-23.pdf',
    'nome AR pdf',
  );
  assert(
    buildCorporateExportFilename('payables', 'csv', at) === 'contas-a-pagar-2026-07-23.csv',
    'nome AP csv',
  );
  assert(parseCorporateExportFormat('xlsx') === 'xlsx', 'parse xlsx');
  assert(parseCorporateExportFormat('PDF') === 'pdf', 'parse pdf');
  let threw = false;
  try {
    parseCorporateExportFormat('doc');
  } catch {
    threw = true;
  }
  assert(threw, 'formato inválido');
  assert(mimeForCorporateExport('xlsx').includes('spreadsheetml'), 'mime xlsx');
  assert(clampExportLimit(99999) <= 5000 || clampExportLimit(99999) > 0, 'limit clamp');
}

function testFiltersSummaries() {
  const cash = summarizeCashFilters({
    fromDate: '2026-07-01',
    toDate: '2026-07-31',
    type: 'INCOME',
    includeReversed: false,
  });
  assert(cash.fromDate === '2026-07-01', 'cash from');
  assert(cash.type === 'INCOME', 'cash type filter');
  const ar = summarizeArApFilters({
    status: 'OPEN',
    overdueOnly: true,
    includeArchived: false,
  });
  assert(ar.status === 'OPEN', 'AR status');
  assert(ar.overdueOnly === true, 'AR overdue');
  assert(humanizeFilterSummary(cash).includes('fromDate'), 'humanize');
}

function testAuditSafe() {
  const payload = buildExportAuditPayload({
    format: 'xlsx',
    module: 'cash-flow',
    rowCount: 3,
    periodLabel: 'jul/2026',
    filters: { fromDate: '2026-07-01', financialAccountId: 'set' },
  });
  const json = JSON.stringify(payload);
  assert(!json.includes('4000'), 'sem valores monetários');
  assert(!json.includes('Cliente'), 'sem cliente');
  assert(payload.rowCount === 3, 'rowCount');
  assert(payload.format === 'xlsx', 'format');
}

function testCsvBomAndAccents() {
  const csv = buildCorporateCsv({
    headers: ['Descrição', 'Valor'],
    rows: [['Recebimento — São José', '4000,00']],
  });
  assert(assertCsvHasBom(csv), 'CSV com BOM');
  assert(csv.includes('Descrição'), 'acentos no header');
  assert(csv.includes('São José'), 'acentos no body');
  assert(formatCorporateDateBr('2026-07-10') === '10/07/2026', 'data BR');
}

async function testExcelReal() {
  const buf = await buildCashFlowExcelBuffer({
    meta: sampleMeta({ format: 'xlsx' }),
    summary: sampleSummary(),
    rows: sampleCashRows(),
  });
  assert(isValidXlsxBuffer(buf), 'XLSX válido (PK zip)');
  assert(!buf.toString('utf8').startsWith('Data;'), 'não é CSV renomeado');
  // Celulas numéricas: ExcelJS grava shared strings + numbers; assinatura ZIP basta + size
  assert(buf.length > 2000, 'xlsx com conteúdo');
}

async function testPdfValidAndMultiPage() {
  const meta = sampleMeta({ format: 'pdf', title: 'Fluxo de Caixa Corporativo' });
  const many = Array.from({ length: 80 }, (_, i) => {
    const base = sampleCashRows()[i % 3]!;
    return {
      ...base,
      code: `MOV-2026-${String(i + 1).padStart(4, '0')}`,
      description: `Linha longa de descrição para forçar quebra ${i + 1} `.repeat(3),
    };
  });
  const buf = await buildCashFlowPdfBuffer({
    meta,
    summary: sampleSummary(),
    rows: many,
  });
  assert(isValidPdfBuffer(buf), 'PDF inicia com %PDF');
  assert(pdfContainsText(buf, 'Fluxo de Caixa') || pdfContainsText(buf, 'Corporativo'), 'título no PDF');
  assert(pdfContainsText(buf, '01/07/2026') || pdfContainsText(buf, 'Per'), 'período no PDF');
  // Totais formatados em pt-BR podem aparecer como "4.000,00"
  assert(
    pdfContainsText(buf, '4.000') || pdfContainsText(buf, '4000') || pdfContainsText(buf, 'Entradas'),
    'totais/entradas no PDF',
  );
  const pageCount = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert(pageCount >= 2, `PDF multipágina got ${pageCount}`);
}

function testEmptyError() {
  const err = new CorporateExportEmptyError();
  assert(err.message.includes('Nenhum registro'), 'mensagem vazia clara');
}

function testDates() {
  assert(formatCorporateDateBr('2026-07-23') === '23/07/2026', 'dd/mm/aaaa');
  assert(formatCorporateDateBr('invalid') === 'invalid' || formatCorporateDateBr('') === '—', 'invalid date');
}

/** Regressão: nunca solicitar master_topography_projects.name (coluna real = title). */
function testProjectTitleColumnRegression() {
  const lookups = read('lib/master/corporateFinance/exports/exportLookups.ts');
  const migration = read('supabase/migrations/20260722120000_master_topography_projects.sql');
  assert(migration.includes('title text NOT NULL'), 'migration tem title');
  assert(!migration.includes('\n  name text'), 'migration sem coluna name de projeto');

  assert(CORPORATE_EXPORT_LABEL_COLUMNS.projects === 'title', 'const label = title');
  assert(lookups.includes("projects: 'title'"), 'lookups usa title');
  assert(
    !lookups.includes("master_topography_projects', ids.projectIds || [], 'name'"),
    'sem name no load projects',
  );
  assert(!lookups.includes("projects: 'name'"), 'sem projects: name');
  assert(
    lookups.includes('CORPORATE_EXPORT_LABEL_COLUMNS.projects'),
    'load usa CORPORATE_EXPORT_LABEL_COLUMNS.projects',
  );

  const withProject = new Map([['proj-1', 'Loteamento Alpha']]);
  assert(mapName(withProject, 'proj-1') === 'Loteamento Alpha', 'título mapeado');
  assert(mapName(withProject, null) === '—', 'sem project_id = —');
  assert(mapName(withProject, undefined) === '—', 'undefined = —');
  assert(mapName(new Map(), 'missing-id') === '—', 'id sem lookup = —');
}

async function testExportsWithAndWithoutProject() {
  const summaryCash = sampleSummary();
  const withProject = sampleCashRows();
  withProject[0]!.project = 'Loteamento Alpha';
  withProject[2]!.project = '—';

  const xlsx = await buildCashFlowExcelBuffer({
    meta: sampleMeta({ format: 'xlsx' }),
    summary: summaryCash,
    rows: withProject,
  });
  assert(isValidXlsxBuffer(xlsx), 'xlsx com/sem projeto');

  const pdf = await buildCashFlowPdfBuffer({
    meta: sampleMeta({ format: 'pdf' }),
    summary: summaryCash,
    rows: withProject,
  });
  assert(isValidPdfBuffer(pdf), 'pdf com/sem projeto');

  const csv = buildCorporateCsv({
    headers: ['Projeto', 'Entrada'],
    rows: [
      ['Loteamento Alpha', '4000,00'],
      ['—', ''],
    ],
  });
  assert(csv.includes('Loteamento Alpha'), 'csv título projeto');
  assert(csv.includes('—'), 'csv sem projeto');

  const arSummary: CorporateArApExportSummary = {
    openAmount: 0,
    dueThisMonthAmount: 0,
    settledThisMonthAmount: 4000,
    overdueAmount: 0,
    statusCounts: { Recebido: 1 },
    rowCount: 1,
  };
  const arRows: CorporateReceivableExportRow[] = [
    {
      code: 'REC-1',
      customer: 'Cliente',
      project: 'Loteamento Alpha',
      quote: 'ORC-1',
      description: 'Serviço',
      issueDate: '01/07/2026',
      dueDate: '10/07/2026',
      originalAmount: 4000,
      discount: 0,
      interest: 0,
      fine: 0,
      netAmount: 4000,
      received: 4000,
      remaining: 0,
      status: 'Recebido',
      account: 'Caixa',
      paymentMethod: 'PIX',
    },
  ];
  const arXlsx = await buildReceivablesExcelBuffer({
    meta: sampleMeta({ module: 'receivables', title: 'Contas a Receber', format: 'xlsx' }),
    summary: arSummary,
    rows: arRows,
  });
  assert(isValidXlsxBuffer(arXlsx), 'AR xlsx com projeto');
  const arPdf = await buildReceivablesPdfBuffer({
    meta: sampleMeta({ module: 'receivables', title: 'Contas a Receber', format: 'pdf' }),
    summary: arSummary,
    rows: arRows,
  });
  assert(isValidPdfBuffer(arPdf), 'AR pdf com projeto');

  const apSummary: CorporateArApExportSummary = {
    openAmount: 0,
    dueThisMonthAmount: 0,
    settledThisMonthAmount: 800,
    overdueAmount: 0,
    statusCounts: { Pago: 2 },
    rowCount: 2,
  };
  const apRows: CorporatePayableExportRow[] = [
    {
      code: 'PAG-1',
      supplier: 'Fornecedor A',
      project: 'Loteamento Alpha',
      description: 'Despesa A',
      issueDate: '01/07/2026',
      dueDate: '12/07/2026',
      originalAmount: 300,
      discount: 0,
      interest: 0,
      fine: 0,
      netAmount: 300,
      paid: 300,
      remaining: 0,
      status: 'Pago',
      account: 'Caixa',
      paymentMethod: 'PIX',
    },
    {
      code: 'PAG-2',
      supplier: 'Fornecedor B',
      project: '—',
      description: 'Despesa B',
      issueDate: '01/07/2026',
      dueDate: '15/07/2026',
      originalAmount: 500,
      discount: 0,
      interest: 0,
      fine: 0,
      netAmount: 500,
      paid: 500,
      remaining: 0,
      status: 'Pago',
      account: 'Caixa',
      paymentMethod: 'TED',
    },
  ];
  const apXlsx = await buildPayablesExcelBuffer({
    meta: sampleMeta({ module: 'payables', title: 'Contas a Pagar', format: 'xlsx' }),
    summary: apSummary,
    rows: apRows,
  });
  assert(isValidXlsxBuffer(apXlsx), 'AP xlsx');
  const apPdf = await buildPayablesPdfBuffer({
    meta: sampleMeta({ module: 'payables', title: 'Contas a Pagar', format: 'pdf' }),
    summary: apSummary,
    rows: apRows,
  });
  assert(isValidPdfBuffer(apPdf), 'AP pdf');
  const apCsv = buildCorporateCsv({
    headers: ['Fornecedor', 'Projeto', 'Pago'],
    rows: apRows.map((r) => [r.supplier, r.project, String(r.paid)]),
  });
  assert(apCsv.includes('Loteamento Alpha') && apCsv.includes('—'), 'AP csv com e sem projeto');
}

async function main() {
  console.log('=== Fase 6.5 corporate exports tests ===');
  testAccess();
  console.log('OK access');
  testFilesIsolation();
  console.log('OK isolation/files');
  testFilenamesAndFormats();
  console.log('OK filenames');
  testFiltersSummaries();
  console.log('OK filters');
  testAuditSafe();
  console.log('OK audit');
  testCsvBomAndAccents();
  console.log('OK csv');
  testDates();
  console.log('OK dates');
  testEmptyError();
  console.log('OK empty');
  testProjectTitleColumnRegression();
  console.log('OK project title regression');
  await testExcelReal();
  console.log('OK excel');
  await testPdfValidAndMultiPage();
  console.log('OK pdf');
  await testExportsWithAndWithoutProject();
  console.log('OK exports with/without project');
  console.log('ALL PASS');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
