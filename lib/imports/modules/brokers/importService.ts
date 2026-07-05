/**
 * Orquestração — validação e execução da importação de corretores.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getBrokerColumnMappingErrorMessage } from '@/lib/imports/modules/brokers/columnMapping';
import { isCustomerImportParseError } from '@/lib/imports/modules/customers/errors';
import { parseBrokerImportFile } from '@/lib/imports/modules/brokers/parseFile';
import {
  buildBrokerInsertPayload,
  buildBrokerMigrationRowDetail,
  buildExistingBrokerIndex,
  validateBrokerRows,
} from '@/lib/imports/modules/brokers/validateRows';
import type {
  BrokerImportExecuteResult,
  BrokerImportValidationResult,
} from '@/lib/imports/modules/brokers/types';

export async function loadExistingBrokersForImport(
  admin: SupabaseClient,
  tenantId: string,
): Promise<
  Array<{
    id: string;
    name?: string | null;
    cpf?: string | null;
    email?: string | null;
    phone?: string | null;
  }>
> {
  const selectFields = 'id, name, cpf, email, phone';

  const byTenant = await admin
    .from('brokers')
    .select(selectFields)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null);

  if (!byTenant.error) return byTenant.data || [];

  console.warn('[loadExistingBrokersForImport] tenant_id query failed:', byTenant.error.message);

  const byCompany = await admin
    .from('brokers')
    .select(selectFields)
    .eq('company_id', tenantId)
    .is('deleted_at', null);

  if (!byCompany.error) return byCompany.data || [];

  console.warn('[loadExistingBrokersForImport] company_id query failed:', byCompany.error.message);
  return [];
}

export async function validateBrokerImportBuffer(
  buffer: Buffer | ArrayBuffer,
  fileName: string,
  existingBrokers: Awaited<ReturnType<typeof loadExistingBrokersForImport>>,
): Promise<BrokerImportValidationResult> {
  let parsed;
  let columnMapping;
  let rows;

  try {
    ({ parsed, columnMapping, rows } = parseBrokerImportFile(buffer, fileName));
  } catch (err) {
    if (isCustomerImportParseError(err)) throw err;
    throw new Error(
      err instanceof Error ? err.message : 'Não foi possível processar o arquivo enviado.',
    );
  }

  const mappingError = getBrokerColumnMappingErrorMessage(columnMapping);

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
          telefone: '',
          telefone_digits: '',
          whatsapp: '',
          whatsapp_digits: '',
          email: '',
          email_normalized: '',
          percentual_comissao_raw: '',
          percentual_comissao: 0,
          observacoes: '',
          ativo_raw: '',
          ativo: true,
          status: 'error',
          messages: [{ level: 'error', text: mappingError }],
          importable: false,
        },
      ],
    };
  }

  const existingIndex = buildExistingBrokerIndex(existingBrokers);
  const { rows: validatedRows, summary } = validateBrokerRows(rows, existingIndex);

  return {
    fileName,
    fileType: parsed.fileType,
    rowCount: parsed.rowCount,
    columnMapping,
    summary,
    rows: validatedRows,
  };
}

export async function executeBrokerImportBuffer(params: {
  admin: SupabaseClient;
  tenantId: string;
  userId: string;
  userName: string;
  buffer: Buffer | ArrayBuffer;
  fileName: string;
}): Promise<BrokerImportExecuteResult> {
  const existingBrokers = await loadExistingBrokersForImport(params.admin, params.tenantId);
  const validation = await validateBrokerImportBuffer(
    params.buffer,
    params.fileName,
    existingBrokers,
  );

  const importableRows = validation.rows.filter((row) => row.importable);
  const payloads = importableRows.map((row) => buildBrokerInsertPayload(row, params.tenantId));

  if (payloads.length === 0) {
    const historyId = await saveBrokerMigrationHistory({
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

  const { error: insertError } = await params.admin.from('brokers').insert(payloads);
  if (insertError) {
    await saveBrokerMigrationHistory({
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
    throw new Error(`Falha ao importar corretores: ${insertError.message}`);
  }

  const historyId = await saveBrokerMigrationHistory({
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

async function saveBrokerMigrationHistory(params: {
  admin: SupabaseClient;
  tenantId: string;
  userId: string;
  userName: string;
  fileName: string;
  validation: BrokerImportValidationResult;
  imported: number;
  status: 'concluido' | 'falhou';
  errorMessage?: string;
  importedRows?: BrokerImportValidationResult['rows'];
}): Promise<string | null> {
  const details = {
    fileType: params.validation.fileType,
    rowCount: params.validation.rowCount,
    columnMapping: params.validation.columnMapping.recognizedHeaders,
    summary: params.validation.summary,
    rows: params.validation.rows.map(buildBrokerMigrationRowDetail),
    importedRows: (params.importedRows || []).map((row) => ({
      lineNumber: row.lineNumber,
      nome: row.nome,
      cpf_cnpj: row.cpf_cnpj,
      email: row.email,
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
        tipo: 'brokers',
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
    console.warn('[saveBrokerMigrationHistory]', error.message);
    return null;
  }

  return data?.id ?? null;
}
