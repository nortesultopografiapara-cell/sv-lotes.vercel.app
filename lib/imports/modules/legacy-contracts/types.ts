/**
 * Tipagens — importação de contratos antigos.
 */

import type { LegacyContractStatusValue } from '@/lib/imports/modules/legacy-contracts/constants';

export type LegacyContractImportField =
  | 'cliente_cpf_cnpj'
  | 'cliente_email'
  | 'empreendimento'
  | 'quadra'
  | 'lote'
  | 'numero_contrato_antigo'
  | 'data_contrato'
  | 'status_contrato'
  | 'nome_arquivo_pdf'
  | 'observacoes';

export type LegacyContractRowStatus =
  | 'valid'
  | 'warning'
  | 'error'
  | 'duplicate'
  | 'existing';

export type LegacyContractImportRowMessage = {
  level: 'info' | 'warning' | 'error';
  text: string;
};

export type ParsedLegacyContractRow = {
  lineNumber: number;
  raw: Record<string, string>;
  cliente_cpf_cnpj: string;
  cliente_cpf_cnpj_digits: string;
  cliente_email: string;
  cliente_email_normalized: string;
  empreendimento: string;
  empreendimento_normalized: string;
  quadra: string;
  quadra_normalized: string;
  lote: string;
  lote_normalized: string;
  numero_contrato_antigo: string;
  data_contrato_raw: string;
  data_contrato: string | null;
  status_contrato_raw: string;
  status_contrato: LegacyContractStatusValue;
  nome_arquivo_pdf: string;
  nome_arquivo_pdf_normalized: string;
  observacoes: string;
};

export type ResolvedLegacyContractRow = ParsedLegacyContractRow & {
  customer_id: string | null;
  customer_name: string | null;
  project_id: string | null;
  project_name: string | null;
  block_id: string | null;
  sale_id: string | null;
  pdf_found: boolean;
  pdf_buffer_key: string | null;
  existing_legacy_document_id: string | null;
};

export type ValidatedLegacyContractRow = ResolvedLegacyContractRow & {
  status: LegacyContractRowStatus;
  messages: LegacyContractImportRowMessage[];
  importable: boolean;
  manual_link_applied?: boolean;
  manual_link_notes?: string | null;
};

export type LegacyContractManualLinkInput = {
  project_id: string;
  quadra: string;
  lote: string;
  customer_name: string;
  observacoes?: string;
};

export type LegacyContractManualLinkOverride = LegacyContractManualLinkInput & {
  lineNumber: number;
};

export type LegacyContractColumnMapping = Partial<Record<LegacyContractImportField, string>>;

export type LegacyContractColumnMappingResult = {
  mapping: LegacyContractColumnMapping;
  unmappedHeaders: string[];
  missingRequired: LegacyContractImportField[];
  recognizedHeaders: Record<LegacyContractImportField, string | undefined>;
};

export type LegacyContractImportSummary = {
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  duplicateRows: number;
  existingRows: number;
  ignoredRows: number;
  importableRows: number;
};

export type LegacyContractImportValidationResult = {
  fileName: string;
  documentsFileName: string | null;
  fileType: 'xlsx' | 'xls' | 'csv' | 'unknown';
  rowCount: number;
  pdfCount: number;
  columnMapping: LegacyContractColumnMappingResult;
  summary: LegacyContractImportSummary;
  rows: ValidatedLegacyContractRow[];
};

export type LegacyContractImportExecuteResult = {
  imported: number;
  ignored: number;
  historyId: string | null;
  summary: LegacyContractImportSummary;
};

export type LegacyContractPdfIndex = Map<string, Buffer>;

export type LegacyContractSaleRecord = {
  id: string;
  customer_id: string | null;
  project_id: string | null;
  block_id: string | null;
  status: string | null;
};

export type LegacyContractImportContext = {
  customers: import('@/lib/imports/modules/sales/types').SalesCustomerIndex;
  customersById: Map<string, { id: string; name: string }>;
  projects: import('@/lib/imports/modules/sales/types').SalesProjectIndex;
  projectsById: Map<string, { id: string; name: string }>;
  blocks: import('@/lib/imports/modules/sales/types').SalesBlockIndex;
  blocksById: Map<string, import('@/lib/imports/modules/sales/types').SalesBlockRecord>;
  blocksByProject: Map<string, import('@/lib/imports/modules/sales/types').SalesBlockRecord[]>;
  salesByCustomerBlock: Map<string, LegacyContractSaleRecord>;
  salesById: Map<string, LegacyContractSaleRecord>;
  legacyDocumentBySaleId: Map<string, { id: string; storage_path: string }>;
};
