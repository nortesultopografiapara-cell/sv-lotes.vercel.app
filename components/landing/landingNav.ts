export const LANDING_NAV_ITEMS = [
  { id: 'inicio', label: 'Início', href: '#inicio' },
  { id: 'recursos', label: 'Recursos', href: '#recursos' },
  { id: 'mapa-gis', label: 'Mapa GIS', href: '#mapa-gis' },
  { id: 'planos', label: 'Planos', href: '#planos' },
  { id: 'beneficios', label: 'Benefícios', href: '#beneficios' },
  { id: 'contato', label: 'Contato', href: '#contato' },
] as const;

export type LandingNavId = (typeof LANDING_NAV_ITEMS)[number]['id'];

export const LANDING_SECTION_IDS: LandingNavId[] = LANDING_NAV_ITEMS.map((item) => item.id);
