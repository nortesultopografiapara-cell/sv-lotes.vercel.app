/**
 * Orquestração — importação de contratos antigos.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildLegacyContractRowsFromPdfIndex } from '@/lib/imports/modules/legacy-contracts/buildRowsFromPdfIndex';
import { getLegacyContractColumnMappingErrorMessage } from '@/lib/imports/modules/legacy-contracts/columnMapping';
import { executeImportableLegacyContractRow } from '@/lib/imports/modules/legacy-contracts/executeRow';
import { loadLegacyContractImportContext } from '@/lib/imports/modules/legacy-contracts/lookupIndex';
import { buildLegacyContractPdfIndexFromUploads } from '@/lib/imports/modules/legacy-contracts/pdfIndex';
import { parseLegacyContractImportFile } from '@/lib/imports/modules/legacy-contracts/parseFile';
import {
  buildLegacyContractMigrationRowDetail,
  validateLegacyContractRows,
} from '@/lib/imports/modules/legacy-contracts/validateRows';
import type {
  LegacyContractImportExecuteResult,
  LegacyContractImportValidationResult,
  LegacyContractPdfIndex,
} from '@/lib/imports/modules/legacy-contracts/types';
import { isCustomerImportParseError } from '@/lib/imports/modules/customers/errors';

function emptyErrorRow(mappingError: string): LegacyContractImportValidationResult['rows'][number] {
  return {
    lineNumber: 1,
    raw: {},
    cliente_cpf_cnpj: '',
    cliente_cpf_cnpj_digits: '',
    cliente_email: '',
    cliente_email_normalized: '',
    empreendimento: '',
    empreendimento_normalized: '',
    quadra: '',
    quadra_normalized: '',
    lote: '',
    lote_normalized: '',
    numero_contrato_antigo: '',
    data_contrato_raw: '',
    data_contrato: null,
    status_contrato_raw: '',
    status_contrato: 'ANTIGO',
    nome_arquivo_pdf: '',
    nome_arquivo_pdf_normalized: '',
    observacoes: '',
    customer_id: null,
    customer_name: null,
    project_id: null,
    project_name: null,
    block_id: null,
    sale_id: null,
    pdf_found: false,
    pdf_buffer_key: null,
    existing_legacy_document_id: null,
    status: 'error',
    messages: [{ level: 'error', text: mappingError }],
    importable: false,
  };
}

const EMPTY_LEGACY_COLUMN_MAPPING: LegacyContractImportValidationResult['columnMapping'] = {
  mapping: {},
  unmappedHeaders: [],
  missingRequired: [],
  recognizedHeaders: {} as LegacyContractImportValidationResult['columnMapping']['recognizedHeaders'],
};

export async function validateLegacyContractDocumentsBuffer(params: {
  documentUploads: Array<{ buffer: Buffer | ArrayBuffer; fileName: string }>;
  documentsFileName: string;
  context: Awaited<ReturnType<typeof loadLegacyContractImportContext>>;
}): Promise<LegacyContractImportValidationResult> {
  const pdfResult = await buildLegacyContractPdfIndexFromUploads(params.documentUploads);
  const rows = buildLegacyContractRowsFromPdfIndex(pdfResult.index);

  if (rows.length === 0) {
    return {
      fileName: params.documentsFileName,
      documentsFileName: params.documentsFileName,
      fileType: 'unknown',
      rowCount: 0,
      pdfCount: 0,
      columnMapping: EMPTY_LEGACY_COLUMN_MAPPING,
      summary: {
        totalRows: 0,
        validRows: 0,
        warningRows: 0,
        errorRows: 1,
        duplicateRows: 0,
        existingRows: 0,
        ignoredRows: 0,
        importableRows: 0,
      },
      rows: [
        emptyErrorRow('Nenhum PDF encontrado nos arquivos enviados.'),
      ],
    };
  }

  const { rows: validatedRows, summary } = validateLegacyContractRows(
    rows,
    params.context,
    pdfResult.index,
  );

  return {
    fileName: params.documentsFileName,
    documentsFileName: params.documentsFileName,
    fileType: 'unknown',
    rowCount: rows.length,
    pdfCount: pdfResult.pdfCount,
    columnMapping: EMPTY_LEGACY_COLUMN_MAPPING,
    summary,
    rows: validatedRows,
  };
}

export async function validateLegacyContractImportBuffer(params: {
  spreadsheetBuffer: Buffer | ArrayBuffer;
  spreadsheetFileName: string;
  documentUploads: Array<{ buffer: Buffer | ArrayBuffer; fileName: string }>;
  documentsFileName: string;
  context: Awaited<ReturnType<typeof loadLegacyContractImportContext>>;
}): Promise<LegacyContractImportValidationResult> {
  let parsed;
  let columnMapping;
  let rows;
  let pdfIndex: LegacyContractPdfIndex;
  let pdfCount = 0;

  try {
    ({ parsed, columnMapping, rows } = parseLegacyContractImportFile(
      params.spreadsheetBuffer,
      params.spreadsheetFileName,
    ));
    const pdfResult = await buildLegacyContractPdfIndexFromUploads(params.documentUploads);
    pdfIndex = pdfResult.index;
    pdfCount = pdfResult.pdfCount;
  } catch (err) {
    if (isCustomerImportParseError(err)) throw err;
    throw new Error(
      err instanceof Error ? err.message : 'Não foi possível processar os arquivos enviados.',
    );
  }

  const mappingError = getLegacyContractColumnMappingErrorMessage(columnMapping);
  if (mappingError) {
    return {
      fileName: params.spreadsheetFileName,
      documentsFileName: params.documentsFileName,
      fileType: parsed.fileType,
      rowCount: parsed.rowCount,
      pdfCount,
      columnMapping,
      summary: {
        totalRows: 0,
        validRows: 0,
        warningRows: 0,
        errorRows: 1,
        duplicateRows: 0,
        existingRows: 0,
        ignoredRows: 0,
        importableRows: 0,
      },
      rows: [emptyErrorRow(mappingError)],
    };
  }

  const { rows: validatedRows, summary } = validateLegacyContractRows(
    rows,
    params.context,
    pdfIndex,
  );

  return {
    fileName: params.spreadsheetFileName,
    documentsFileName: params.documentsFileName,
    fileType: parsed.fileType,
    rowCount: parsed.rowCount,
    pdfCount,
    columnMapping,
    summary,
    rows: validatedRows,
  };
}

export async function executeLegacyContractImportBuffer(params: {
  admin: SupabaseClient;
  tenantId: string;
  userId: string;
  userName: string;
  spreadsheetBuffer?: Buffer | ArrayBuffer;
  spreadsheetFileName?: string;
  documentUploads: Array<{ buffer: Buffer | ArrayBuffer; fileName: string }>;
  documentsFileName: string;
}): Promise<LegacyContractImportExecuteResult> {
  const context = await loadLegacyContractImportContext(params.admin, params.tenantId);
  const pdfResult = await buildLegacyContractPdfIndexFromUploads(params.documentUploads);

  const validation =
    params.spreadsheetBuffer && params.spreadsheetFileName
      ? await validateLegacyContractImportBuffer({
          spreadsheetBuffer: params.spreadsheetBuffer,
          spreadsheetFileName: params.spreadsheetFileName,
          documentUploads: params.documentUploads,
          documentsFileName: params.documentsFileName,
          context,
        })
      : await validateLegacyContractDocumentsBuffer({
          documentUploads: params.documentUploads,
          documentsFileName: params.documentsFileName,
          context,
        });

  const importableRows = validation.rows.filter((row) => row.importable);
  let imported = 0;

  for (const row of importableRows) {
    const result = await executeImportableLegacyContractRow({
      admin: params.admin,
      tenantId: params.tenantId,
      userId: params.userId,
      row,
      pdfIndex: pdfResult.index,
    });

    if (result.ok) {
      imported += 1;
    } else {
      row.status = 'error';
      row.importable = false;
      row.messages.push({ level: 'error', text: result.error });
    }
  }

  const historyId = await saveLegacyContractMigrationHistory({
    admin: params.admin,
    tenantId: params.tenantId,
    userId: params.userId,
    userName: params.userName,
    fileName: params.spreadsheetFileName || params.documentsFileName,
    documentsFileName: params.documentsFileName,
    validation,
    imported,
    status: imported > 0 || validation.summary.importableRows === 0 ? 'concluido' : 'falhou',
  });

  return {
    imported,
    ignored: validation.summary.ignoredRows + (validation.summary.importableRows - imported),
    historyId,
    summary: {
      ...validation.summary,
      importableRows: imported,
      ignoredRows: validation.summary.totalRows - imported,
    },
  };
}

async function saveLegacyContractMigrationHistory(params: {
  admin: SupabaseClient;
  tenantId: string;
  userId: string;
  userName: string;
  fileName: string;
  documentsFileName: string | null;
  validation: LegacyContractImportValidationResult;
  imported: number;
  status: 'concluido' | 'falhou';
}): Promise<string | null> {
  const details = {
    fileType: params.validation.fileType,
    rowCount: params.validation.rowCount,
    pdfCount: params.validation.pdfCount,
    documentsFileName: params.documentsFileName,
    columnMapping: params.validation.columnMapping.recognizedHeaders,
    summary: params.validation.summary,
    rows: params.validation.rows.map(buildLegacyContractMigrationRowDetail),
  };

  const { data, error } = await params.admin
    .from('data_migration_history')
    .insert([
      {
        company_id: params.tenantId,
        migrated_at: new Date().toISOString(),
        tipo: 'legacy_contracts',
        arquivo: `${params.fileName} + ${params.documentsFileName || 'documentos'}`,
        usuario: params.userName,
        usuario_id: params.userId,
        quantidade_total: params.validation.summary.totalRows,
        quantidade_importada: params.imported,
        quantidade_erros: params.validation.summary.errorRows,
        quantidade_duplicados:
          params.validation.summary.duplicateRows + params.validation.summary.existingRows,
        status: params.status,
        detalhes_json: details,
      },
    ])
    .select('id')
    .single();

  if (error) {
    console.warn('[saveLegacyContractMigrationHistory]', error.message);
    return null;
  }

  return data?.id ?? null;
}

export { loadLegacyContractImportContext };
