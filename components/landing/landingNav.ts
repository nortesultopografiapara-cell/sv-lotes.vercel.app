export const LANDING_SECTION_IDS = [
  'home',
  'recursos',
  'como-funciona',
  'beneficios',
  'planos',
  'sobre',
  'contato',
] as const;

export type LandingNavId = (typeof LANDING_SECTION_IDS)[number];

export const LANDING_NAV_ITEMS: { id: LandingNavId; href: string; label: string }[] = [
  { id: 'recursos', href: '#recursos', label: 'Recursos' },
  { id: 'como-funciona', href: '#como-funciona', label: 'Como funciona' },
  { id: 'beneficios', href: '#beneficios', label: 'Benefícios' },
  { id: 'planos', href: '#planos', label: 'Planos' },
  { id: 'sobre', href: '#sobre', label: 'Sobre' },
  { id: 'contato', href: '#contato', label: 'Contato' },
];
