/**
 * Modelos de etapas — preparação futura (não aplicados automaticamente).
 * Padrão atual: Orçamento em branco (zero etapas).
 */

export const QUOTE_STAGE_TEMPLATE_BLANK = 'BLANK' as const;

/** Templates futuros — não usados na criação automática nesta fase. */
export const QUOTE_STAGE_TEMPLATES = [
  {
    code: QUOTE_STAGE_TEMPLATE_BLANK,
    label: 'Orçamento em branco',
    stages: [] as string[],
    isDefault: true,
  },
  {
    code: 'GEORREF',
    label: 'Modelo Georreferenciamento',
    stages: [] as string[],
    isDefault: false,
  },
  {
    code: 'LEVANTAMENTO',
    label: 'Modelo Levantamento Topográfico',
    stages: [] as string[],
    isDefault: false,
  },
  {
    code: 'INFRA',
    label: 'Modelo Infraestrutura',
    stages: [
      'Serviços Preliminares',
      'Terraplanagem',
      'Drenagem',
      'Pavimentação',
      'Calçadas',
      'Elétrico',
      'Sinalização',
    ],
    isDefault: false,
  },
  {
    code: 'LOTEAMENTO',
    label: 'Modelo Loteamento',
    stages: [] as string[],
    isDefault: false,
  },
  {
    code: 'DRONE_LIDAR',
    label: 'Modelo Drone/LiDAR',
    stages: [] as string[],
    isDefault: false,
  },
] as const;

export type QuoteStageTemplateCode = (typeof QUOTE_STAGE_TEMPLATES)[number]['code'];

/** @deprecated Mantido só como referência histórica; criação não usa mais. */
export const DEFAULT_QUOTE_STAGE_NAMES = QUOTE_STAGE_TEMPLATES.find((t) => t.code === 'INFRA')
  ?.stages ?? [];

export type DefaultQuoteStageName = string;

export function getDefaultQuoteStageTemplate() {
  return QUOTE_STAGE_TEMPLATES.find((t) => t.isDefault) ?? QUOTE_STAGE_TEMPLATES[0];
}
