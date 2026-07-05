/**
 * Constantes — importação de contratos antigos.
 */

export const LEGACY_CONTRACTS_IMPORT_TEMPLATE_COLUMNS = [
  'cliente_cpf_cnpj',
  'cliente_email',
  'empreendimento',
  'quadra',
  'lote',
  'numero_contrato_antigo',
  'data_contrato',
  'status_contrato',
  'nome_arquivo_pdf',
  'observacoes',
] as const;

export const LEGACY_CONTRACTS_IMPORT_REQUIRED_FIELDS = [
  'empreendimento',
  'quadra',
  'lote',
  'nome_arquivo_pdf',
] as const;

export const LEGACY_CONTRACTS_FIELD_ALIASES: Record<
  (typeof LEGACY_CONTRACTS_IMPORT_TEMPLATE_COLUMNS)[number],
  string[]
> = {
  cliente_cpf_cnpj: ['cliente_cpf_cnpj', 'cpf_cnpj', 'cpf', 'cnpj', 'documento'],
  cliente_email: ['cliente_email', 'email', 'e-mail'],
  empreendimento: ['empreendimento', 'projeto', 'project'],
  quadra: ['quadra', 'block', 'qd'],
  lote: ['lote', 'lot', 'numero_lote'],
  numero_contrato_antigo: [
    'numero_contrato_antigo',
    'numero_contrato',
    'contrato_antigo',
    'numero_contrato',
  ],
  data_contrato: ['data_contrato', 'data', 'contract_date'],
  status_contrato: ['status_contrato', 'status', 'situacao'],
  nome_arquivo_pdf: [
    'nome_arquivo_pdf',
    'arquivo_pdf',
    'pdf',
    'nome_pdf',
    'arquivo',
  ],
  observacoes: ['observacoes', 'observacao', 'notes'],
};

export const LEGACY_CONTRACT_STATUS_VALUES = [
  'ASSINADO',
  'PENDENTE',
  'CANCELADO',
  'QUITADO',
  'ANTIGO',
] as const;

export type LegacyContractStatusValue = (typeof LEGACY_CONTRACT_STATUS_VALUES)[number];

export const LEGACY_CONTRACTS_TEMPLATE_EXAMPLE_ROWS: Array<
  Record<(typeof LEGACY_CONTRACTS_IMPORT_TEMPLATE_COLUMNS)[number], string>
> = [
  {
    cliente_cpf_cnpj: '000.000.000-00',
    cliente_email: 'exemplo@email.com',
    empreendimento: 'Empreendimento Exemplo',
    quadra: 'A',
    lote: '1',
    numero_contrato_antigo: 'CTR-2020-001',
    data_contrato: '15/03/2020',
    status_contrato: 'ASSINADO',
    nome_arquivo_pdf: 'contrato_exemplo.pdf',
    observacoes: 'Linha de exemplo — não será importada',
  },
];

export const LEGACY_CONTRACTS_STORAGE_BUCKET = 'legacy-contracts';
