/**
 * Tipagens — atualização de parcelas de vendas importadas.
 */

export type InstallmentImportField =
  | 'venda_id'
  | 'parcela_id'
  | 'empreendimento'
  | 'quadra'
  | 'lote'
  | 'cliente'
  | 'numero_parcela'
  | 'vencimento'
  | 'novo_vencimento'
  | 'status'
  | 'valor'
  | 'valor_pago'
  | 'data_pagamento'
  | 'observacoes';

export type InstallmentRowStatus =
  | 'valid'
  | 'warning'
  | 'error'
  | 'duplicate'
  | 'existing';

export type InstallmentImportRowMessage = {
  level: 'info' | 'warning' | 'error';
  text: string;
};

export type ParsedInstallmentRow = {
  lineNumber: number;
  raw: Record<string, string>;
  venda_id: string;
  parcela_id: string;
  empreendimento: string;
  empreendimento_normalized: string;
  quadra: string;
  quadra_normalized: string;
  lote: string;
  lote_normalized: string;
  cliente: string;
  cliente_normalized: string;
  numero_parcela_raw: string;
  numero_parcela: number | null;
  vencimento_raw: string;
  vencimento: string | null;
  novo_vencimento_raw: string;
  novo_vencimento: string | null;
  status_raw: string;
  status_normalized: string;
  valor_raw: string;
  valor: number | null;
  valor_pago_raw: string;
  valor_pago: number | null;
  data_pagamento_raw: string;
  data_pagamento: string | null;
  observacoes: string;
};

export type ValidatedInstallmentRow = ParsedInstallmentRow & {
  status: InstallmentRowStatus;
  messages: InstallmentImportRowMessage[];
  importable: boolean;
  located: boolean;
  receipt_id: string | null;
  sale_id: string | null;
  project_id: string | null;
  project_name: string | null;
  block_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  current_due_date: string | null;
  current_status: string | null;
  current_amount: number | null;
  current_paid_amount: number | null;
  resolved_status: string | null;
};

export type InstallmentColumnMapping = Partial<Record<InstallmentImportField, string>>;

export type InstallmentColumnMappingResult = {
  mapping: InstallmentColumnMapping;
  unmappedHeaders: string[];
  missingRequired: InstallmentImportField[];
  recognizedHeaders: Record<InstallmentImportField, string | undefined>;
};

export type InstallmentImportSummary = {
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  duplicateRows: number;
  existingRows: number;
  ignoredRows: number;
  importableRows: number;
  locatedRows: number;
  notLocatedRows: number;
  updateRows: number;
};

export type InstallmentImportValidationResult = {
  fileName: string;
  fileType: 'xlsx' | 'xls' | 'csv' | 'unknown';
  rowCount: number;
  columnMapping: InstallmentColumnMappingResult;
  summary: InstallmentImportSummary;
  rows: ValidatedInstallmentRow[];
};

export type InstallmentImportExecuteResult = {
  updated: number;
  ignored: number;
  historyId: string | null;
  summary: InstallmentImportSummary;
};

export type InstallmentReceiptRecord = {
  id: string;
  sale_id: string;
  customer_id: string;
  project_id: string | null;
  block_id: string | null;
  installment_number: number;
  due_date: string;
  amount: number;
  paid_amount: number | null;
  paid_at: string | null;
  status: string;
};

export type InstallmentSaleRecord = {
  id: string;
  customer_id: string;
  block_id: string | null;
  project_id: string | null;
  customer_name: string;
};

import type { SalesBlockRecord } from '@/lib/imports/modules/sales/types';

export type InstallmentImportContext = {
  projects: Map<string, { id: string; name: string }>;
  projectsByName: Map<string, { id: string; name: string }>;
  blocks: Map<string, SalesBlockRecord>;
  receiptsById: Map<string, InstallmentReceiptRecord>;
  receiptsBySaleAndNumber: Map<string, InstallmentReceiptRecord>;
  salesById: Map<string, InstallmentSaleRecord>;
  salesByBlockId: Map<string, InstallmentSaleRecord>;
};
