/**
 * Colunas e aliases — importação de corretores.
 */

import type { BrokerImportField } from '@/lib/imports/modules/brokers/types';

export const BROKER_IMPORT_TEMPLATE_COLUMNS: BrokerImportField[] = [
  'nome',
  'cpf_cnpj',
  'telefone',
  'whatsapp',
  'email',
  'percentual_comissao',
  'observacoes',
  'ativo',
];

export const BROKER_IMPORT_REQUIRED_FIELDS: BrokerImportField[] = ['nome'];

export const BROKER_IMPORT_FIELD_ALIASES: Record<BrokerImportField, string[]> = {
  nome: ['nome', 'corretor', 'nome_corretor', 'nome completo', 'nome_completo'],
  cpf_cnpj: ['cpf_cnpj', 'cpf', 'cnpj', 'cpf/cnpj', 'documento', 'doc'],
  telefone: ['telefone', 'fone', 'contato'],
  whatsapp: ['whatsapp', 'celular', 'zap', 'telefone_whatsapp'],
  email: ['email', 'e-mail', 'e_mail', 'correio'],
  percentual_comissao: [
    'percentual_comissao',
    'percentual comissao',
    'percentual comissão',
    'comissao',
    'comissão',
    'comissao_percentual',
    'percentual',
  ],
  observacoes: ['observacoes', 'observações', 'observacao', 'observação'],
  ativo: ['ativo', 'status', 'habilitado'],
};

export const BROKER_TEMPLATE_EXAMPLE_ROWS: Record<BrokerImportField, string>[] = [
  {
    nome: 'EXEMPLO — Ana Corretora Silva',
    cpf_cnpj: '123.456.789-09',
    telefone: '(11) 3333-4444',
    whatsapp: '(11) 98888-7777',
    email: 'ana.exemplo@email.com',
    percentual_comissao: '5%',
    observacoes: 'Linha de exemplo — remover antes de importar',
    ativo: 'SIM',
  },
  {
    nome: 'EXEMPLO — Carlos Parceiro',
    cpf_cnpj: '',
    telefone: '(21) 2222-3333',
    whatsapp: '',
    email: 'carlos.exemplo@email.com',
    percentual_comissao: '3,5',
    observacoes: 'Linha de exemplo',
    ativo: 'ATIVO',
  },
];
