/**
 * Tipagens — importação de clientes.
 */

export type CustomerImportField =
  | 'nome'
  | 'cpf_cnpj'
  | 'rg'
  | 'telefone'
  | 'whatsapp'
  | 'email'
  | 'endereco'
  | 'cidade'
  | 'uf'
  | 'cep'
  | 'estado_civil'
  | 'profissao'
  | 'observacoes';

export type CustomerRowStatus =
  | 'valid'
  | 'warning'
  | 'error'
  | 'duplicate'
  | 'existing';

export type CustomerImportRowMessage = {
  level: 'info' | 'warning' | 'error';
  text: string;
};

export type ParsedCustomerRow = {
  lineNumber: number;
  raw: Record<string, string>;
  nome: string;
  cpf_cnpj: string;
  cpf_cnpj_digits: string;
  rg: string;
  telefone: string;
  telefone_digits: string;
  whatsapp: string;
  whatsapp_digits: string;
  email: string;
  endereco: string;
  cidade: string;
  uf: string;
  cep: string;
  cep_digits: string;
  estado_civil: string;
  profissao: string;
  observacoes: string;
};

export type ValidatedCustomerRow = ParsedCustomerRow & {
  status: CustomerRowStatus;
  messages: CustomerImportRowMessage[];
  importable: boolean;
};

export type CustomerColumnMapping = Partial<Record<CustomerImportField, string>>;

export type CustomerColumnMappingResult = {
  mapping: CustomerColumnMapping;
  unmappedHeaders: string[];
  missingRequired: CustomerImportField[];
  recognizedHeaders: Record<CustomerImportField, string | undefined>;
};

export type CustomerImportSummary = {
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  duplicateRows: number;
  existingRows: number;
  ignoredRows: number;
  importableRows: number;
};

export type CustomerImportValidationResult = {
  fileName: string;
  fileType: 'xlsx' | 'xls' | 'csv' | 'unknown';
  rowCount: number;
  columnMapping: CustomerColumnMappingResult;
  summary: CustomerImportSummary;
  rows: ValidatedCustomerRow[];
};

export type CustomerImportExecuteResult = {
  imported: number;
  ignored: number;
  historyId: string | null;
  summary: CustomerImportSummary;
};

export type ExistingCustomerIndex = {
  byCpfDigits: Map<string, { id: string; name: string }>;
  byNamePhone: Map<string, { id: string; name: string }>;
};
