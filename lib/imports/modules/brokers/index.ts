import type { ImportModuleDefinition } from '@/lib/imports/types';

export const brokersImportModule: ImportModuleDefinition = {
  id: 'brokers',
  title: 'Corretores',
  description: 'Importe corretores e percentuais de comissão.',
  status: 'available_soon',
  statusLabel: 'Disponível em breve',
  enabled: true,
};

export const BROKERS_IMPORT_TEMPLATE_COLUMNS = [
  'nome',
  'email',
  'telefone',
  'cpf',
  'creci',
  'comissao_percentual',
] as const;
