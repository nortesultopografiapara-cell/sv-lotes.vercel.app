/**
 * Orquestração — validação e execução da importação de vendas.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSaleColumnMappingErrorMessage } from '@/lib/imports/modules/sales/columnMapping';
import { executeImportableSaleRow } from '@/lib/imports/modules/sales/executeSaleRow';
import { loadSalesImportContext } from '@/lib/imports/modules/sales/lookupIndex';
import { parseSaleImportFile } from '@/lib/imports/modules/sales/parseFile';
import {
  buildSaleMigrationRowDetail,
  validateSaleRows,
} from '@/lib/imports/modules/sales/validateRows';
import type {
  SaleImportExecuteResult,
  SaleImportValidationResult,
} from '@/lib/imports/modules/sales/types';
import { isCustomerImportParseError } from '@/lib/imports/modules/customers/errors';

export async function validateSaleImportBuffer(
  buffer: Buffer | ArrayBuffer,
  fileName: string,
  context: Awaited<ReturnType<typeof loadSalesImportContext>>,
): Promise<SaleImportValidationResult> {
  let parsed;
  let columnMapping;
  let rows;

  try {
    ({ parsed, columnMapping, rows } = parseSaleImportFile(buffer, fileName));
  } catch (err) {
    if (isCustomerImportParseError(err)) throw err;
    throw new Error(
      err instanceof Error ? err.message : 'Não foi possível processar o arquivo enviado.',
    );
  }

  const mappingError = getSaleColumnMappingErrorMessage(columnMapping);

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
          cliente_cpf_cnpj: '',
          cliente_cpf_cnpj_digits: '',
          cliente_email: '',
          cliente_email_normalized: '',
          cliente_telefone: '',
          cliente_telefone_digits: '',
          corretor_cpf_cnpj: '',
          corretor_cpf_cnpj_digits: '',
          corretor_email: '',
          corretor_email_normalized: '',
          corretor_nome: '',
          corretor_nome_normalized: '',
          empreendimento: '',
          empreendimento_normalized: '',
          quadra: '',
          quadra_normalized: '',
          lote: '',
          lote_normalized: '',
          data_venda_raw: '',
          data_venda: null,
          valor_total_raw: '',
          valor_total: 0,
          entrada_raw: '',
          entrada: 0,
          sinal_raw: '',
          sinal: 0,
          saldo_raw: '',
          saldo: null,
          quantidade_parcelas_raw: '',
          quantidade_parcelas: 1,
          vencimento_primeira_parcela_raw: '',
          vencimento_primeira_parcela: null,
          percentual_comissao_raw: '',
          percentual_comissao: null,
          status_raw: '',
          status_normalized: '',
          observacoes: '',
          customer_id: null,
          customer_name: null,
          broker_id: null,
          broker_name: null,
          project_id: null,
          project_name: null,
          block_id: null,
          block_status: null,
          resolved_block_status: 'Vendido',
          resolved_commission_percent: 0,
          payment_type: 'À vista',
          status: 'error',
          messages: [{ level: 'error', text: mappingError }],
          importable: false,
        },
      ],
    };
  }

  const { rows: validatedRows, summary } = validateSaleRows(rows, context);

  return {
    fileName,
    fileType: parsed.fileType,
    rowCount: parsed.rowCount,
    columnMapping,
    summary,
    rows: validatedRows,
  };
}

export async function executeSaleImportBuffer(params: {
  admin: SupabaseClient;
  tenantId: string;
  userId: string;
  userName: string;
  buffer: Buffer | ArrayBuffer;
  fileName: string;
}): Promise<SaleImportExecuteResult> {
  const context = await loadSalesImportContext(params.admin, params.tenantId);
  const validation = await validateSaleImportBuffer(params.buffer, params.fileName, context);

  const importableRows = validation.rows.filter((row) => row.importable);
  let imported = 0;

  for (const row of importableRows) {
    try {
      const result = await executeImportableSaleRow({
        admin: params.admin,
        tenantId: params.tenantId,
        userId: params.userId,
        row,
      });
      if (result.ok) imported += 1;
      else {
        row.status = 'error';
        row.importable = false;
        row.messages.push({ level: 'error', text: result.error });
      }
    } catch (err) {
      row.status = 'error';
      row.importable = false;
      row.messages.push({
        level: 'error',
        text: err instanceof Error ? err.message : 'Erro interno ao importar venda.',
      });
    }
  }

  const historyId = await saveSaleMigrationHistory({
    admin: params.admin,
    tenantId: params.tenantId,
    userId: params.userId,
    userName: params.userName,
    fileName: params.fileName,
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

async function saveSaleMigrationHistory(params: {
  admin: SupabaseClient;
  tenantId: string;
  userId: string;
  userName: string;
  fileName: string;
  validation: SaleImportValidationResult;
  imported: number;
  status: 'concluido' | 'falhou';
  errorMessage?: string;
}): Promise<string | null> {
  const details = {
    fileType: params.validation.fileType,
    rowCount: params.validation.rowCount,
    columnMapping: params.validation.columnMapping.recognizedHeaders,
    summary: params.validation.summary,
    rows: params.validation.rows.map(buildSaleMigrationRowDetail),
    errorMessage: params.errorMessage || null,
  };

  const { data, error } = await params.admin
    .from('data_migration_history')
    .insert([
      {
        company_id: params.tenantId,
        migrated_at: new Date().toISOString(),
        tipo: 'sales',
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
    console.warn('[saveSaleMigrationHistory]', error.message);
    return null;
  }

  return data?.id ?? null;
}

export { loadSalesImportContext };
