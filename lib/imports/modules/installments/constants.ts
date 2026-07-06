/**
 * Colunas e aliases — atualização de parcelas importadas.
 */

import type { InstallmentImportField } from '@/lib/imports/modules/installments/types';

export const INSTALLMENTS_IMPORT_TEMPLATE_COLUMNS: InstallmentImportField[] = [
  'venda_id',
  'parcela_id',
  'empreendimento',
  'quadra',
  'lote',
  'cliente',
  'numero_parcela',
  'vencimento',
  'novo_vencimento',
  'status',
  'valor',
  'valor_pago',
  'data_pagamento',
  'observacoes',
];

export const INSTALLMENTS_IMPORT_REQUIRED_FIELDS: InstallmentImportField[] = ['numero_parcela'];

export const INSTALLMENTS_IMPORT_FIELD_ALIASES: Record<InstallmentImportField, string[]> = {
  venda_id: ['venda_id', 'sale_id', 'id_venda', 'venda'],
  parcela_id: ['parcela_id', 'installment_id', 'id_parcela', 'receipt_id'],
  empreendimento: ['empreendimento', 'projeto', 'project', 'nome_empreendimento'],
  quadra: ['quadra', 'block', 'block_name', 'nome_quadra'],
  lote: ['lote', 'numero_lote', 'lot', 'lot_number', 'number'],
  cliente: ['cliente', 'nome_cliente', 'customer', 'customer_name'],
  numero_parcela: [
    'numero_parcela',
    'numero parcela',
    'parcela',
    'installment_number',
    'n_parcela',
  ],
  vencimento: ['vencimento', 'due_date', 'data_vencimento', 'vencimento_atual'],
  novo_vencimento: ['novo_vencimento', 'novo vencimento', 'new_due_date'],
  status: ['status', 'situacao', 'situação'],
  valor: ['valor', 'valor_parcela', 'amount', 'valor_atual'],
  valor_pago: ['valor_pago', 'valor pago', 'paid_amount', 'pago'],
  data_pagamento: ['data_pagamento', 'data pagamento', 'paid_at', 'pagamento'],
  observacoes: ['observacoes', 'observações', 'observacao', 'notas'],
};

export const INSTALLMENTS_TEMPLATE_EXAMPLE_ROWS: Record<InstallmentImportField, string>[] = [
  {
    venda_id: '',
    parcela_id: '',
    empreendimento: 'EXEMPLO — Residencial Modelo',
    quadra: 'A',
    lote: '12',
    cliente: 'EXEMPLO — Maria Cliente',
    numero_parcela: '3',
    vencimento: '15/05/2025',
    novo_vencimento: '20/05/2025',
    status: 'pago',
    valor: 'R$ 1.250,00',
    valor_pago: 'R$ 1.250,00',
    data_pagamento: '18/05/2025',
    observacoes: 'Linha de exemplo — remover antes de importar',
  },
];
