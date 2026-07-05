/**
 * Testes — importação de contratos antigos (Migração de Dados).
 * npm run test:data-migration-legacy-contracts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  LEGACY_CONTRACTS_IMPORT_TEMPLATE_COLUMNS,
} from '../lib/imports/modules/legacy-contracts/constants';
import {
  buildLegacyContractImportXlsxBuffer,
} from '../lib/imports/modules/legacy-contracts/templates';
import { legacyContractsImportModule } from '../lib/imports/modules/legacy-contracts';
import { validateLegacyContractImportBuffer } from '../lib/imports/modules/legacy-contracts/importService';
import {
  buildLegacyContractSaleKey,
  parseLegacyContractDate,
  parseLegacyContractStatus,
} from '../lib/imports/modules/legacy-contracts/normalize';
import {
  buildLegacyContractPdfIndex,
  buildLegacyContractPdfIndexFromUploads,
} from '../lib/imports/modules/legacy-contracts/pdfIndex';
import { validateLegacyContractRows } from '../lib/imports/modules/legacy-contracts/validateRows';
import type {
  LegacyContractImportContext,
  ParsedLegacyContractRow,
} from '../lib/imports/modules/legacy-contracts/types';
import {
  buildSalesBlockIndex,
  buildSalesCustomerIndex,
  buildSalesProjectIndex,
} from '../lib/imports/modules/sales/lookupIndex';
import {
  applyLegacyContractsValidationAndAdvance,
  canAdvanceWizardStep,
  INITIAL_MIGRATION_WIZARD_STATE,
} from '../lib/imports/services/migrationWizardState';
import {
  appendLegacyContractFormData,
  extractLegacyContractFormFiles,
} from '../lib/imports/helpers/legacyContractFormData';
import { getWizardStepsForModule } from '../lib/imports/services/migrationWizardSteps';
import {
  buildImportCsvTemplate,
  getImportTemplateHeaders,
} from '../lib/imports/services/templateDownload';
import {
  isAcceptedImportFile,
  isAcceptedLegacyDocumentFile,
  parseImportFileMeta,
} from '../lib/imports/helpers/parseImportFileMeta';

const ROOT = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function buildMockContext(
  overrides: Partial<LegacyContractImportContext> = {},
): LegacyContractImportContext {
  const customers = buildSalesCustomerIndex([
    {
      id: 'cust-1',
      name: 'Cliente Teste',
      cpf_cnpj: '529.982.247-25',
      email: 'cliente@teste.com',
      phone: '11999998888',
    },
  ]);
  const projects = buildSalesProjectIndex([
    { id: 'proj-1', name: 'Empreendimento Real Teste' },
  ]);
  const { index: blocks, blocksByProject } = buildSalesBlockIndex([
    {
      id: 'block-1',
      project_id: 'proj-1',
      block_name: 'A',
      number: '1',
      lot_number: '1',
      status: 'Vendido',
      sale_id: 'sale-1',
      customer_id: 'cust-1',
      price: 90000,
    },
    {
      id: 'block-2',
      project_id: 'proj-1',
      block_name: 'B',
      number: '2',
      lot_number: '2',
      status: 'Disponível',
      sale_id: null,
      customer_id: null,
      price: 80000,
    },
  ]);

  const salesByCustomerBlock = new Map([
    [
      buildLegacyContractSaleKey('cust-1', 'block-1'),
      {
        id: 'sale-1',
        customer_id: 'cust-1',
        project_id: 'proj-1',
        block_id: 'block-1',
        status: 'ACTIVE',
      },
    ],
  ]);

  return {
    customers,
    projects,
    blocks,
    blocksByProject,
    salesByCustomerBlock,
    legacyDocumentBySaleId: new Map(),
    ...overrides,
  };
}

function buildRow(overrides: Partial<ParsedLegacyContractRow> = {}): ParsedLegacyContractRow {
  return {
    lineNumber: 2,
    raw: {},
    cliente_cpf_cnpj: '529.982.247-25',
    cliente_cpf_cnpj_digits: '52998224725',
    cliente_email: 'cliente@teste.com',
    cliente_email_normalized: 'CLIENTE@TESTE.COM',
    empreendimento: 'Empreendimento Real Teste',
    empreendimento_normalized: 'EMPREENDIMENTO REAL TESTE',
    quadra: 'A',
    quadra_normalized: 'A',
    lote: '1',
    lote_normalized: '1',
    numero_contrato_antigo: 'CTR-2020-001',
    data_contrato_raw: '15/03/2020',
    data_contrato: '2020-03-15',
    status_contrato_raw: 'ASSINADO',
    status_contrato: 'ASSINADO',
    nome_arquivo_pdf: 'contrato_teste.pdf',
    nome_arquivo_pdf_normalized: 'contrato_teste.pdf',
    observacoes: '',
    ...overrides,
  };
}

function testModuleDefinition() {
  assert(legacyContractsImportModule.id === 'legacy_contracts', 'id legacy_contracts');
  assert(legacyContractsImportModule.title === 'Contratos Antigos', 'título');
  assert(
    legacyContractsImportModule.description.includes('vendas já existentes'),
    'descrição',
  );
  assert(legacyContractsImportModule.status === 'available', 'disponível');
  console.log('OK testModuleDefinition');
}

function testNormalize() {
  const date = parseLegacyContractDate('05/06/2026');
  assert(date.value === '2026-06-05', 'data dd/mm/aaaa');

  const status = parseLegacyContractStatus('assinado');
  assert(status.value === 'ASSINADO', 'status ASSINADO');

  const invalid = parseLegacyContractStatus('INVALIDO');
  assert(invalid.value === 'ANTIGO', 'status inválido vira ANTIGO');
  assert(Boolean(invalid.error), 'aviso status inválido');
  console.log('OK testNormalize');
}

async function testPdfIndex() {
  const pdfBuffer = Buffer.from('%PDF-1.4 legacy contract');
  const { index, pdfCount } = await buildLegacyContractPdfIndex(
    pdfBuffer,
    'contrato_teste.pdf',
  );
  assert(pdfCount === 1, '1 pdf individual');
  assert(index.has('contrato_teste.pdf'), 'pdf indexado');

  try {
    await buildLegacyContractPdfIndex(Buffer.from('x'), 'notas.txt');
    assert(false, 'txt deve falhar');
  } catch (err) {
    assert(err instanceof Error && err.message.includes('PDF ou ZIP'), 'erro txt');
  }
  const multi = await buildLegacyContractPdfIndexFromUploads([
    { buffer: Buffer.from('%PDF-1'), fileName: 'a.pdf' },
    { buffer: Buffer.from('%PDF-2'), fileName: 'b.pdf' },
  ]);
  assert(multi.pdfCount === 2, '2 pdfs múltiplos');
  assert(multi.index.has('a.pdf') && multi.index.has('b.pdf'), 'índice múltiplos');
  console.log('OK testPdfIndex');
}

async function testValidationRows() {
  const context = buildMockContext();
  const pdfBuffer = Buffer.from('%PDF-1.4');
  const { index } = await buildLegacyContractPdfIndex(pdfBuffer, 'contrato_teste.pdf');

  const valid = validateLegacyContractRows([buildRow()], context, index);
  assert(valid.summary.importableRows === 1, 'linha válida importável');
  assert(valid.rows[0]?.sale_id === 'sale-1', 'venda localizada');

  const missingSale = validateLegacyContractRows(
    [
      buildRow({
        quadra: 'B',
        quadra_normalized: 'B',
        lote: '2',
        lote_normalized: '2',
      }),
    ],
    context,
    index,
  );
  assert(
    missingSale.rows[0]?.messages.some((m) => m.text.includes('Venda não localizada')),
    'venda não localizada',
  );

  const missingPdf = validateLegacyContractRows(
    [
      buildRow({
        nome_arquivo_pdf: 'inexistente.pdf',
        nome_arquivo_pdf_normalized: 'inexistente.pdf',
      }),
    ],
    context,
    index,
  );
  assert(
    missingPdf.rows[0]?.messages.some((m) => m.text.includes('PDF não encontrado')),
    'pdf ausente',
  );

  const existingContext = buildMockContext({
    legacyDocumentBySaleId: new Map([
      ['sale-1', { id: 'legacy-1', storage_path: 'tenant/sale-1/contrato.pdf' }],
    ]),
  });
  const existing = validateLegacyContractRows([buildRow()], existingContext, index);
  assert(existing.rows[0]?.status === 'existing', 'existente ignorado');
  assert(existing.summary.existingRows === 1, 'contagem existente');
  console.log('OK testValidationRows');
}

async function testValidateBuffer() {
  const csv = [
    LEGACY_CONTRACTS_IMPORT_TEMPLATE_COLUMNS.join(';'),
    [
      '529.982.247-25',
      'cliente@teste.com',
      'Empreendimento Real Teste',
      'A',
      '1',
      'CTR-2020-001',
      '15/03/2020',
      'ASSINADO',
      'contrato_teste.pdf',
      '',
    ].join(';'),
  ].join('\n');
  const pdfBuffer = Buffer.from('%PDF-1.4');
  const context = buildMockContext();

  const validation = await validateLegacyContractImportBuffer({
    spreadsheetBuffer: Buffer.from(csv, 'utf8'),
    spreadsheetFileName: 'mapeamento.csv',
    documentUploads: [{ buffer: pdfBuffer, fileName: 'contrato_teste.pdf' }],
    documentsFileName: 'contrato_teste.pdf',
    context,
  });

  assert(validation.summary.totalRows === 1, 'linhas lidas');
  assert(validation.summary.importableRows === 1, 'linha importável');
  assert(validation.pdfCount === 1, 'pdf count');
  console.log('OK testValidateBuffer');
}

function testWizardIntegration() {
  const steps = getWizardStepsForModule('legacy_contracts');
  assert(steps.length === 8, '8 etapas legacy');
  assert(steps.some((step) => step.id === 'upload-documents'), 'passo PDFs');

  let state = {
    ...INITIAL_MIGRATION_WIZARD_STATE,
    step: 'upload-documents' as const,
    selectedModuleId: 'legacy_contracts' as const,
    uploadedFile: parseImportFileMeta(new File(['a'], 'map.csv', { type: 'text/csv' })),
    uploadedDocumentsFiles: [
      parseImportFileMeta(new File(['%PDF'], 'docs.pdf', { type: 'application/pdf' })),
    ],
  };

  state = applyLegacyContractsValidationAndAdvance(state, {
    fileName: 'map.csv',
    documentsFileName: 'docs.pdf',
    fileType: 'csv',
    rowCount: 1,
    pdfCount: 1,
    columnMapping: {
      mapping: {},
      unmappedHeaders: [],
      missingRequired: [],
      recognizedHeaders: {} as never,
    },
    summary: {
      totalRows: 1,
      validRows: 1,
      warningRows: 0,
      errorRows: 0,
      duplicateRows: 0,
      existingRows: 0,
      ignoredRows: 0,
      importableRows: 1,
    },
    rows: [],
  });
  assert(state.step === 'pre-validation', 'avanço pós-validação legacy');
  console.log('OK testWizardIntegration');
}

function testFormDataFieldNames() {
  const formData = new FormData();
  const spreadsheet = new File(['a;b'], 'mapeamento.csv', { type: 'text/csv' });
  const pdf1 = new File(['%PDF-1'], 'contrato_a.pdf', { type: 'application/pdf' });
  const zip = new File(['PK'], 'contratos.zip', { type: 'application/zip' });

  appendLegacyContractFormData(formData, {
    mappingFile: spreadsheet,
    documentFiles: [pdf1, zip],
    activeTenantId: 'tenant-1',
  });

  assert(formData.has('mappingFile'), 'mappingFile enviado');
  assert(formData.getAll('documentFiles').length === 2, 'documentFiles múltiplos');
  assert(formData.get('activeTenantId') === 'tenant-1', 'tenant opcional');

  const extracted = extractLegacyContractFormFiles(formData);
  assert(extracted.mappingFile?.name === 'mapeamento.csv', 'planilha extraída');
  assert(extracted.documentFiles.length === 2, 'documentos extraídos');
  assert(extracted.documentFiles[0]?.name === 'contrato_a.pdf', 'pdf extraído');
  assert(extracted.documentFiles[1]?.name === 'contratos.zip', 'zip extraído');
  console.log('OK testFormDataFieldNames');
}

function testWizardUploadStepConstraints() {
  const wizard = read('components/imports/DataMigrationWizard.tsx');
  const uploadSection =
    wizard.match(/case 'upload':[\s\S]*?case 'upload-documents':/)?.[0] ?? '';
  const docsSection =
    wizard.match(/case 'upload-documents':[\s\S]*?case 'pre-validation':/)?.[0] ?? '';

  assert(uploadSection.includes('ACCEPTED_IMPORT_ACCEPT_ATTR'), 'planilha aceita xlsx/xls/csv');
  assert(!uploadSection.includes('multiple'), 'planilha sem multiple');
  assert(uploadSection.includes('data-testid="migration-file-input"'), 'input planilha');

  assert(
    docsSection.includes('.pdf,.zip,application/pdf,application/zip,application/x-zip-compressed'),
    'pdfs aceita pdf/zip',
  );
  assert(docsSection.includes('multiple'), 'pdfs com multiple');
  assert(
    docsSection.includes(
      'Selecione os PDFs dos contratos antigos ou um arquivo ZIP contendo os PDFs.',
    ),
    'texto área pdfs',
  );
  assert(wizard.includes('appendLegacyContractFormData'), 'formData legacy');
  assert(wizard.includes("mappingFile: spreadsheetFile"), 'mappingFile no validate');

  let state = {
    ...INITIAL_MIGRATION_WIZARD_STATE,
    step: 'upload-documents' as const,
    selectedModuleId: 'legacy_contracts' as const,
  };
  assert(!canAdvanceWizardStep(state), 'pdfs rejeita ausência de arquivo');

  state = {
    ...state,
    uploadedDocumentsFiles: [
      parseImportFileMeta(new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' })),
    ],
  };
  assert(canAdvanceWizardStep(state), 'pdfs aceita ao menos 1 arquivo');

  const spreadsheetState = {
    ...INITIAL_MIGRATION_WIZARD_STATE,
    step: 'upload' as const,
    selectedModuleId: 'legacy_contracts' as const,
  };
  assert(!canAdvanceWizardStep(spreadsheetState), 'planilha rejeita ausência');
  assert(
    canAdvanceWizardStep({
      ...spreadsheetState,
      uploadedFile: parseImportFileMeta(
        new File(['a'], 'map.xlsx', {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      ),
    }),
    'planilha aceita excel',
  );

  const xlsx = new File(['x'], 'map.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  assert(isAcceptedImportFile(xlsx), 'excel na etapa planilha');
  assert(!isAcceptedLegacyDocumentFile(xlsx), 'excel rejeitado na etapa pdfs');
  console.log('OK testWizardUploadStepConstraints');
}

function testTemplatesAndUi() {
  const headers = getImportTemplateHeaders('legacy_contracts');
  assert(headers.includes('nome_arquivo_pdf'), 'header pdf');
  assert(headers.includes('cliente_cpf_cnpj'), 'header cpf');

  const csv = buildImportCsvTemplate('legacy_contracts');
  assert(csv.includes('numero_contrato_antigo'), 'csv legacy');

  const wizard = read('components/imports/DataMigrationWizard.tsx');
  assert(wizard.includes('migration-step-upload-documents'), 'step upload docs');
  assert(wizard.includes('migration-documents-file-input'), 'input pdfs');
  assert(wizard.includes('applyLegacyContractsValidationAndAdvance'), 'avanço legacy');
  assert(wizard.includes('/api/data-migration/legacy-contracts/validate'), 'api validate');
  assert(wizard.includes('documentFiles'), 'documentFiles no wizard');

  const pdf = new File(['%PDF'], 'contrato.pdf', { type: 'application/pdf' });
  assert(isAcceptedLegacyDocumentFile(pdf), 'pdf aceito');
  const zip = new File(['PK'], 'contratos.zip', { type: 'application/zip' });
  assert(isAcceptedLegacyDocumentFile(zip), 'zip aceito');

  assert(fs.existsSync(path.join(ROOT, 'app/api/data-migration/legacy-contracts/validate/route.ts')), 'route validate');
  assert(fs.existsSync(path.join(ROOT, 'app/api/data-migration/legacy-contracts/execute/route.ts')), 'route execute');
  assert(fs.existsSync(path.join(ROOT, 'app/api/sales/[saleId]/legacy-contract/route.ts')), 'route legacy view');
  assert(fs.existsSync(path.join(ROOT, 'app/api/sales/[saleId]/legacy-contract/pdf/route.ts')), 'route legacy pdf');
  assert(fs.existsSync(path.join(ROOT, 'lib/legacyContractDocumentService.ts')), 'legacy doc service');
  assert(fs.existsSync(path.join(ROOT, 'components/contracts/LegacyContractDocumentsSection.tsx')), 'legacy ui');
  assert(fs.existsSync(path.join(ROOT, 'supabase/migrations/20260705140000_legacy_contract_documents.sql')), 'migration sql');
  const contractsPage = read('app/contracts/page.tsx');
  assert(contractsPage.includes('LegacyContractDocumentsSection'), 'contracts page legacy section');
  const legacyUi = read('components/contracts/LegacyContractDocumentsSection.tsx');
  assert(legacyUi.includes('Contratos Antigos'), 'legacy ui title');
  assert(legacyUi.includes('Abrir PDF'), 'legacy open pdf button');
  console.log('OK testTemplatesAndUi');
}

async function testXlsxTemplate() {
  const buffer = await buildLegacyContractImportXlsxBuffer();
  assert(buffer.length > 100, 'xlsx gerado');
  console.log('OK testXlsxTemplate');
}

async function main() {
  testModuleDefinition();
  testNormalize();
  await testPdfIndex();
  await testValidationRows();
  await testValidateBuffer();
  testWizardIntegration();
  testFormDataFieldNames();
  testWizardUploadStepConstraints();
  testTemplatesAndUi();
  await testXlsxTemplate();
  console.log('\nTodos os testes de contratos antigos passaram.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
