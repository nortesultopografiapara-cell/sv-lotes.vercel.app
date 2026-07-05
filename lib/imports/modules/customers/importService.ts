/**
 * Orquestração — validação e execução da importação de clientes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getColumnMappingErrorMessage } from '@/lib/imports/modules/customers/columnMapping';
import { parseCustomerImportFile } from '@/lib/imports/modules/customers/parseFile';
import {
  buildCustomerInsertPayload,
  buildExistingCustomerIndex,
  buildMigrationRowDetail,
  validateCustomerRows,
} from '@/lib/imports/modules/customers/validateRows';
import type {
  CustomerImportExecuteResult,
  CustomerImportValidationResult,
} from '@/lib/imports/modules/customers/types';

export async function loadExistingCustomersForImport(
  admin: SupabaseClient,
  tenantId: string,
): Promise<
  Array<{
    id: string;
    name?: string | null;
    cpf_cnpj?: string | null;
    document?: string | null;
    phone?: string | null;
  }>
> {
  const { data, error } = await admin
    .from('customers')
    .select('id, name, cpf_cnpj, document, phone')
    .or(`tenant_id.eq.${tenantId},company_id.eq.${tenantId}`);

  if (error) {
    throw new Error(`Erro ao carregar clientes existentes: ${error.message}`);
  }

  return data || [];
}

export async function validateCustomerImportBuffer(
  buffer: Buffer | ArrayBuffer,
  fileName: string,
  existingCustomers: Awaited<ReturnType<typeof loadExistingCustomersForImport>>,
): Promise<CustomerImportValidationResult> {
  const { parsed, columnMapping, rows } = parseCustomerImportFile(buffer, fileName);
  const mappingError = getColumnMappingErrorMessage(columnMapping);

  if (mappingError) {
    return {
      fileName,
      fileType: parsed.fileType,
      rowCount: parsed.rowCount,
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
      rows: [
        {
          lineNumber: 1,
          raw: {},
          nome: '',
          cpf_cnpj: '',
          cpf_cnpj_digits: '',
          rg: '',
          telefone: '',
          telefone_digits: '',
          whatsapp: '',
          whatsapp_digits: '',
          email: '',
          endereco: '',
          cidade: '',
          uf: '',
          cep: '',
          cep_digits: '',
          estado_civil: '',
          profissao: '',
          observacoes: '',
          status: 'error',
          messages: [{ level: 'error', text: mappingError }],
          importable: false,
        },
      ],
    };
  }

  const existingIndex = buildExistingCustomerIndex(existingCustomers);
  const { rows: validatedRows, summary } = validateCustomerRows(rows, existingIndex);

  return {
    fileName,
    fileType: parsed.fileType,
    rowCount: parsed.rowCount,
    columnMapping,
    summary,
    rows: validatedRows,
  };
}

export async function executeCustomerImportBuffer(params: {
  admin: SupabaseClient;
  tenantId: string;
  userId: string;
  userName: string;
  buffer: Buffer | ArrayBuffer;
  fileName: string;
}): Promise<CustomerImportExecuteResult> {
  const existingCustomers = await loadExistingCustomersForImport(params.admin, params.tenantId);
  const validation = await validateCustomerImportBuffer(
    params.buffer,
    params.fileName,
    existingCustomers,
  );

  const importableRows = validation.rows.filter((row) => row.importable);
  const payloads = importableRows.map((row) =>
    buildCustomerInsertPayload(row, params.tenantId),
  );

  if (payloads.length === 0) {
    const historyId = await saveMigrationHistory({
      admin: params.admin,
      tenantId: params.tenantId,
      userId: params.userId,
      userName: params.userName,
      fileName: params.fileName,
      validation,
      imported: 0,
      status: 'concluido',
    });

    return {
      imported: 0,
      ignored: validation.summary.ignoredRows,
      historyId,
      summary: validation.summary,
    };
  }

  const { error: insertError } = await params.admin.from('customers').insert(payloads);
  if (insertError) {
    await saveMigrationHistory({
      admin: params.admin,
      tenantId: params.tenantId,
      userId: params.userId,
      userName: params.userName,
      fileName: params.fileName,
      validation,
      imported: 0,
      status: 'falhou',
      errorMessage: insertError.message,
    });
    throw new Error(`Falha ao importar clientes: ${insertError.message}`);
  }

  const historyId = await saveMigrationHistory({
    admin: params.admin,
    tenantId: params.tenantId,
    userId: params.userId,
    userName: params.userName,
    fileName: params.fileName,
    validation,
    imported: payloads.length,
    status: 'concluido',
    importedRows: importableRows,
  });

  return {
    imported: payloads.length,
    ignored: validation.summary.ignoredRows,
    historyId,
    summary: validation.summary,
  };
}

async function saveMigrationHistory(params: {
  admin: SupabaseClient;
  tenantId: string;
  userId: string;
  userName: string;
  fileName: string;
  validation: CustomerImportValidationResult;
  imported: number;
  status: 'concluido' | 'falhou';
  errorMessage?: string;
  importedRows?: CustomerImportValidationResult['rows'];
}): Promise<string | null> {
  const details = {
    fileType: params.validation.fileType,
    rowCount: params.validation.rowCount,
    columnMapping: params.validation.columnMapping.recognizedHeaders,
    summary: params.validation.summary,
    rows: params.validation.rows.map(buildMigrationRowDetail),
    importedRows: (params.importedRows || []).map((row) => ({
      lineNumber: row.lineNumber,
      nome: row.nome,
      cpf_cnpj: row.cpf_cnpj,
      observacoes: row.observacoes || null,
    })),
    errorMessage: params.errorMessage || null,
  };

  const { data, error } = await params.admin
    .from('data_migration_history')
    .insert([
      {
        company_id: params.tenantId,
        migrated_at: new Date().toISOString(),
        tipo: 'customers',
        arquivo: params.fileName,
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
    console.warn('[saveMigrationHistory]', error.message);
    return null;
  }

  return data?.id ?? null;
}
