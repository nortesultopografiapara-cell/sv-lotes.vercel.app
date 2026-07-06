/**
 * Orquestração — validação e execução da atualização de parcelas.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isCustomerImportParseError } from '@/lib/imports/modules/customers/errors';
import { getInstallmentColumnMappingErrorMessage } from '@/lib/imports/modules/installments/columnMapping';
import { executeImportableInstallmentRow } from '@/lib/imports/modules/installments/executeRow';
import { loadInstallmentImportContext } from '@/lib/imports/modules/installments/lookupIndex';
import { parseInstallmentImportFile } from '@/lib/imports/modules/installments/parseFile';
import type {
  InstallmentImportExecuteResult,
  InstallmentImportValidationResult,
} from '@/lib/imports/modules/installments/types';
import {
  buildInstallmentMigrationRowDetail,
  validateInstallmentRows,
} from '@/lib/imports/modules/installments/validateRows';

export async function validateInstallmentImportBuffer(
  buffer: Buffer | ArrayBuffer,
  fileName: string,
  context: Awaited<ReturnType<typeof loadInstallmentImportContext>>,
): Promise<InstallmentImportValidationResult> {
  let parsed;
  let columnMapping;
  let rows;

  try {
    ({ parsed, columnMapping, rows } = parseInstallmentImportFile(buffer, fileName));
  } catch (err) {
    if (isCustomerImportParseError(err)) throw err;
    throw new Error(
      err instanceof Error ? err.message : 'Não foi possível processar o arquivo enviado.',
    );
  }

  const mappingError = getInstallmentColumnMappingErrorMessage(columnMapping);
  if (mappingError) {
    throw new Error(mappingError);
  }

  const { rows: validatedRows, summary } = validateInstallmentRows(rows, context);

  return {
    fileName,
    fileType: parsed.fileType,
    rowCount: parsed.rowCount,
    columnMapping,
    summary,
    rows: validatedRows,
  };
}

export async function executeInstallmentImportBuffer(params: {
  admin: SupabaseClient;
  tenantId: string;
  userId: string;
  userName: string;
  buffer: Buffer | ArrayBuffer;
  fileName: string;
}): Promise<InstallmentImportExecuteResult> {
  const context = await loadInstallmentImportContext(params.admin, params.tenantId);
  const validation = await validateInstallmentImportBuffer(
    params.buffer,
    params.fileName,
    context,
  );

  const importableRows = validation.rows.filter((row) => row.importable);
  let updated = 0;

  for (const row of importableRows) {
    const result = await executeImportableInstallmentRow({
      admin: params.admin,
      tenantId: params.tenantId,
      row,
    });
    if (result.ok) updated += 1;
  }

  const historyId = await saveInstallmentMigrationHistory({
    admin: params.admin,
    tenantId: params.tenantId,
    userId: params.userId,
    userName: params.userName,
    fileName: params.fileName,
    validation,
    updated,
    status: 'concluido',
    updatedRows: importableRows.slice(0, updated),
  });

  return {
    updated,
    ignored: validation.summary.ignoredRows + (importableRows.length - updated),
    historyId,
    summary: validation.summary,
  };
}

async function saveInstallmentMigrationHistory(params: {
  admin: SupabaseClient;
  tenantId: string;
  userId: string;
  userName: string;
  fileName: string;
  validation: InstallmentImportValidationResult;
  updated: number;
  status: 'concluido' | 'falhou';
  errorMessage?: string;
  updatedRows?: InstallmentImportValidationResult['rows'];
}): Promise<string | null> {
  const details = {
    fileType: params.validation.fileType,
    rowCount: params.validation.rowCount,
    columnMapping: params.validation.columnMapping.recognizedHeaders,
    summary: params.validation.summary,
    rows: params.validation.rows.map(buildInstallmentMigrationRowDetail),
    updatedRows: (params.updatedRows || []).map(buildInstallmentMigrationRowDetail),
    errorMessage: params.errorMessage || null,
  };

  const { data, error } = await params.admin
    .from('data_migration_history')
    .insert([
      {
        company_id: params.tenantId,
        migrated_at: new Date().toISOString(),
        tipo: 'installments',
        arquivo: params.fileName,
        usuario: params.userName,
        usuario_id: params.userId,
        quantidade_total: params.validation.summary.totalRows,
        quantidade_importada: params.updated,
        quantidade_erros: params.validation.summary.errorRows,
        quantidade_duplicados: params.validation.summary.duplicateRows,
        status: params.status,
        detalhes_json: details,
      },
    ])
    .select('id')
    .single();

  if (error) {
    console.warn('[saveInstallmentMigrationHistory]', error.message);
    return null;
  }

  return data?.id ? String(data.id) : null;
}
