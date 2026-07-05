/**
 * Colunas e aliases — importação de clientes.
 */

import type { CustomerImportField } from '@/lib/imports/modules/customers/types';

export const CUSTOMER_IMPORT_TEMPLATE_COLUMNS: CustomerImportField[] = [
  'nome',
  'cpf_cnpj',
  'rg',
  'telefone',
  'whatsapp',
  'email',
  'endereco',
  'cidade',
  'uf',
  'cep',
  'estado_civil',
  'profissao',
  'observacoes',
];

export const CUSTOMER_IMPORT_REQUIRED_FIELDS: CustomerImportField[] = ['nome'];

export const CUSTOMER_IMPORT_FIELD_ALIASES: Record<CustomerImportField, string[]> = {
  nome: ['nome', 'cliente', 'comprador', 'nome_cliente', 'nome_completo', 'nome completo'],
  cpf_cnpj: ['cpf_cnpj', 'cpf', 'cnpj', 'cpf/cnpj', 'documento', 'doc'],
  telefone: ['telefone', 'fone', 'contato'],
  whatsapp: ['whatsapp', 'celular', 'zap', 'telefone_whatsapp'],
  email: ['email', 'e-mail', 'e_mail', 'correio'],
  endereco: ['endereco', 'endereço', 'logradouro', 'rua'],
  cidade: ['cidade', 'municipio', 'município'],
  uf: ['uf', 'estado'],
  cep: ['cep'],
  rg: ['rg', 'identidade'],
  estado_civil: ['estado_civil', 'estado civil'],
  profissao: ['profissao', 'profissão'],
  observacoes: ['observacoes', 'observações', 'observacao', 'observação'],
};

export const CUSTOMER_TEMPLATE_EXAMPLE_ROWS: Record<CustomerImportField, string>[] = [
  {
    nome: 'EXEMPLO — Maria Silva Santos',
    cpf_cnpj: '123.456.789-09',
    rg: '12.345.678-9',
    telefone: '(11) 3333-4444',
    whatsapp: '(11) 98888-7777',
    email: 'maria.exemplo@email.com',
    endereco: 'Rua das Flores, 100',
    cidade: 'São Paulo',
    uf: 'SP',
    cep: '01234-567',
    estado_civil: 'CASADA',
    profissao: 'ENGENHEIRA',
    observacoes: 'Linha de exemplo — remover antes de importar',
  },
  {
    nome: 'EXEMPLO — João Comercial Ltda',
    cpf_cnpj: '12.345.678/0001-90',
    rg: '',
    telefone: '(21) 2222-3333',
    whatsapp: '',
    email: 'contato.exemplo@empresa.com.br',
    endereco: 'Av. Central, 500',
    cidade: 'Rio de Janeiro',
    uf: 'RJ',
    cep: '20000-000',
    estado_civil: '',
    profissao: '',
    observacoes: 'Linha de exemplo — CNPJ fictício',
  },
];
