/**
 * Tipagens — importação de corretores.
 */

export type BrokerImportField =
  | 'nome'
  | 'cpf_cnpj'
  | 'telefone'
  | 'whatsapp'
  | 'email'
  | 'percentual_comissao'
  | 'observacoes'
  | 'ativo';

export type BrokerRowStatus =
  | 'valid'
  | 'warning'
  | 'error'
  | 'duplicate'
  | 'existing';

export type BrokerImportRowMessage = {
  level: 'info' | 'warning' | 'error';
  text: string;
};

export type ParsedBrokerRow = {
  lineNumber: number;
  raw: Record<string, string>;
  nome: string;
  cpf_cnpj: string;
  cpf_cnpj_digits: string;
  telefone: string;
  telefone_digits: string;
  whatsapp: string;
  whatsapp_digits: string;
  email: string;
  email_normalized: string;
  percentual_comissao_raw: string;
  percentual_comissao: number;
  observacoes: string;
  ativo_raw: string;
  ativo: boolean;
};

export type ValidatedBrokerRow = ParsedBrokerRow & {
  status: BrokerRowStatus;
  messages: BrokerImportRowMessage[];
  importable: boolean;
};

export type BrokerColumnMapping = Partial<Record<BrokerImportField, string>>;

export type BrokerColumnMappingResult = {
  mapping: BrokerColumnMapping;
  unmappedHeaders: string[];
  missingRequired: BrokerImportField[];
  recognizedHeaders: Record<BrokerImportField, string | undefined>;
};

export type BrokerImportSummary = {
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  duplicateRows: number;
  existingRows: number;
  ignoredRows: number;
  importableRows: number;
};

export type BrokerImportValidationResult = {
  fileName: string;
  fileType: 'xlsx' | 'xls' | 'csv' | 'unknown';
  rowCount: number;
  columnMapping: BrokerColumnMappingResult;
  summary: BrokerImportSummary;
  rows: ValidatedBrokerRow[];
};

export type BrokerImportExecuteResult = {
  imported: number;
  ignored: number;
  historyId: string | null;
  summary: BrokerImportSummary;
};

export type ExistingBrokerIndex = {
  byCpfDigits: Map<string, { id: string; name: string }>;
  byEmail: Map<string, { id: string; name: string }>;
  byPhone: Map<string, { id: string; name: string }>;
};
