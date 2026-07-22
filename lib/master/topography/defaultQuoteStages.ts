/** Etapas padrão de orçamento de engenharia (Master Topografia). */

export const DEFAULT_QUOTE_STAGE_NAMES = [
  'Serviços Preliminares',
  'Terraplanagem',
  'Drenagem',
  'Pavimentação',
  'Calçadas',
  'Elétrico',
  'Sinalização',
] as const;

export type DefaultQuoteStageName = (typeof DEFAULT_QUOTE_STAGE_NAMES)[number];
