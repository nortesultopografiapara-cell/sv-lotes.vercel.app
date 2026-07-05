/**
 * Tipagens — importação de vendas.
 */

export type SaleImportField =
  | 'cliente_cpf_cnpj'
  | 'cliente_email'
  | 'cliente_telefone'
  | 'corretor_cpf_cnpj'
  | 'corretor_email'
  | 'corretor_nome'
  | 'empreendimento'
  | 'quadra'
  | 'lote'
  | 'data_venda'
  | 'valor_total'
  | 'entrada'
  | 'sinal'
  | 'saldo'
  | 'quantidade_parcelas'
  | 'vencimento_primeira_parcela'
  | 'percentual_comissao'
  | 'status'
  | 'observacoes';

export type SaleRowStatus =
  | 'valid'
  | 'warning'
  | 'error'
  | 'duplicate'
  | 'existing';

export type SaleImportRowMessage = {
  level: 'info' | 'warning' | 'error';
  text: string;
};

export type ParsedSaleRow = {
  lineNumber: number;
  raw: Record<string, string>;
  cliente_cpf_cnpj: string;
  cliente_cpf_cnpj_digits: string;
  cliente_email: string;
  cliente_email_normalized: string;
  cliente_telefone: string;
  cliente_telefone_digits: string;
  corretor_cpf_cnpj: string;
  corretor_cpf_cnpj_digits: string;
  corretor_email: string;
  corretor_email_normalized: string;
  corretor_nome: string;
  corretor_nome_normalized: string;
  empreendimento: string;
  empreendimento_normalized: string;
  quadra: string;
  quadra_normalized: string;
  lote: string;
  lote_normalized: string;
  data_venda_raw: string;
  data_venda: string | null;
  valor_total_raw: string;
  valor_total: number;
  entrada_raw: string;
  entrada: number;
  sinal_raw: string;
  sinal: number;
  saldo_raw: string;
  saldo: number | null;
  quantidade_parcelas_raw: string;
  quantidade_parcelas: number;
  vencimento_primeira_parcela_raw: string;
  vencimento_primeira_parcela: string | null;
  percentual_comissao_raw: string;
  percentual_comissao: number | null;
  status_raw: string;
  status_normalized: string;
  observacoes: string;
};

export type ResolvedSaleRow = ParsedSaleRow & {
  customer_id: string | null;
  customer_name: string | null;
  broker_id: string | null;
  broker_name: string | null;
  project_id: string | null;
  project_name: string | null;
  block_id: string | null;
  block_status: string | null;
  resolved_block_status: 'Vendido' | 'Reservado';
  resolved_commission_percent: number;
  payment_type: 'À vista' | 'Parcelado';
};

export type ValidatedSaleRow = ResolvedSaleRow & {
  status: SaleRowStatus;
  messages: SaleImportRowMessage[];
  importable: boolean;
};

export type SaleColumnMapping = Partial<Record<SaleImportField, string>>;

export type SaleColumnMappingResult = {
  mapping: SaleColumnMapping;
  unmappedHeaders: string[];
  missingRequired: SaleImportField[];
  recognizedHeaders: Record<SaleImportField, string | undefined>;
};

export type SaleImportSummary = {
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  duplicateRows: number;
  existingRows: number;
  ignoredRows: number;
  importableRows: number;
};

export type SaleImportValidationResult = {
  fileName: string;
  fileType: 'xlsx' | 'xls' | 'csv' | 'unknown';
  rowCount: number;
  columnMapping: SaleColumnMappingResult;
  summary: SaleImportSummary;
  rows: ValidatedSaleRow[];
};

export type SaleImportExecuteResult = {
  imported: number;
  ignored: number;
  historyId: string | null;
  summary: SaleImportSummary;
};

export type SalesCustomerIndex = {
  byCpfDigits: Map<string, { id: string; name: string }>;
  byEmail: Map<string, { id: string; name: string }>;
  byPhone: Map<string, { id: string; name: string }>;
};

export type SalesBrokerIndex = {
  byCpfDigits: Map<string, { id: string; name: string; commission_percent?: number | null }>;
  byEmail: Map<string, { id: string; name: string; commission_percent?: number | null }>;
  byName: Map<string, { id: string; name: string; commission_percent?: number | null }>;
};

export type SalesProjectIndex = Map<string, { id: string; name: string }>;

export type SalesBlockRecord = {
  id: string;
  project_id: string;
  block_name: string | null;
  number: string | null;
  lot_number: string | null;
  status: string | null;
  sale_id: string | null;
  customer_id: string | null;
  price: number | null;
};

export type SalesBlockIndex = Map<string, SalesBlockRecord>;

export type SalesImportContext = {
  customers: SalesCustomerIndex;
  brokers: SalesBrokerIndex;
  projects: SalesProjectIndex;
  blocks: SalesBlockIndex;
  activeSaleBlockIds: Set<string>;
};
