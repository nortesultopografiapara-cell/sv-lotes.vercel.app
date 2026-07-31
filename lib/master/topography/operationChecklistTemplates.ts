import type { ChecklistTemplateCode } from './operationTaskTypes';

export type ChecklistTemplateItem = {
  title: string;
  is_required?: boolean;
  is_critical?: boolean;
};

export const OPERATION_CHECKLIST_TEMPLATES: Record<
  ChecklistTemplateCode,
  { label: string; items: ChecklistTemplateItem[] }
> = {
  AEROLEVANTAMENTO: {
    label: 'Aerolevantamento',
    items: [
      { title: 'Autorização de voo', is_required: true, is_critical: true },
      { title: 'Baterias carregadas', is_required: true, is_critical: true },
      { title: 'Cartão formatado', is_required: true, is_critical: false },
      { title: 'Plano de voo', is_required: true, is_critical: true },
      { title: 'Previsão do tempo', is_required: true, is_critical: false },
      { title: 'Área conferida', is_required: true, is_critical: true },
      { title: 'Pontos de apoio', is_required: false, is_critical: false },
      { title: 'Backup dos dados', is_required: true, is_critical: true },
    ],
  },
  LEVANTAMENTO_TOPOGRAFICO: {
    label: 'Levantamento topográfico',
    items: [
      { title: 'GNSS carregado', is_required: true, is_critical: true },
      { title: 'Base e rover', is_required: true, is_critical: true },
      { title: 'Controladora', is_required: true, is_critical: true },
      { title: 'Bastão', is_required: true, is_critical: false },
      { title: 'Tripé', is_required: true, is_critical: false },
      { title: 'Arquivo de apoio', is_required: false, is_critical: false },
      { title: 'Marcos', is_required: false, is_critical: false },
      { title: 'Veículo', is_required: true, is_critical: false },
      { title: 'EPIs', is_required: true, is_critical: true },
    ],
  },
};

export function isChecklistTemplateCode(value: string): value is ChecklistTemplateCode {
  return value === 'AEROLEVANTAMENTO' || value === 'LEVANTAMENTO_TOPOGRAFICO';
}
