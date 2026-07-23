/** Tipos de serviço — SV Topografia & Projetos (Master). */

export const TOPOGRAPHY_SERVICE_TYPES = [
  { code: 'LEVANTAMENTO_TOPOGRAFICO', label: 'Levantamento Topográfico' },
  { code: 'LEVANTAMENTO_PLANIALTIMETRICO', label: 'Levantamento Planialtimétrico' },
  { code: 'LEVANTAMENTO_CADASTRAL', label: 'Levantamento Cadastral' },
  { code: 'GEORREF_RURAL', label: 'Georreferenciamento Rural' },
  { code: 'GEORREF_URBANO', label: 'Georreferenciamento Urbano' },
  { code: 'DESMEMBRAMENTO', label: 'Desmembramento' },
  { code: 'REMEMBRAMENTO', label: 'Remembramento' },
  { code: 'RETIFICACAO_AREA', label: 'Retificação de Área' },
  { code: 'IMPLANTACAO_MARCOS', label: 'Implantação de Marcos' },
  { code: 'LOCACAO_OBRAS', label: 'Locação de Obras' },
  { code: 'ACOMPANHAMENTO_OBRAS', label: 'Acompanhamento de Obras' },
  { code: 'CONTROLE_TERRAPLENAGEM', label: 'Controle de Terraplenagem' },
  { code: 'AEROFOTOGRAMETRIA', label: 'Aerofotogrametria' },
  { code: 'LEVANTAMENTO_DRONE', label: 'Levantamento com Drone' },
  { code: 'LIDAR', label: 'LiDAR' },
  { code: 'PROJETO_LOTEAMENTO', label: 'Projeto de Loteamento' },
  { code: 'REGULARIZACAO_FUNDIARIA', label: 'Regularização Fundiária' },
  { code: 'REURB', label: 'REURB' },
  { code: 'DEMARCACAO_LOTES', label: 'Demarcação de Lotes' },
  { code: 'LOCACAO_EQUIPAMENTOS', label: 'Locação de Equipamentos' },
  { code: 'CONSULTORIA_TECNICA', label: 'Consultoria Técnica' },
  { code: 'OUTRO', label: 'Outro' },
] as const;

export type TopographyServiceTypeCode = (typeof TOPOGRAPHY_SERVICE_TYPES)[number]['code'];

export function isTopographyServiceType(value: string): value is TopographyServiceTypeCode {
  return TOPOGRAPHY_SERVICE_TYPES.some((s) => s.code === value);
}

export function topographyServiceTypeLabel(code: string): string {
  return TOPOGRAPHY_SERVICE_TYPES.find((s) => s.code === code)?.label ?? code;
}
