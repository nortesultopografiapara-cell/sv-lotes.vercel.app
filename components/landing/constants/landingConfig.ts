/** Configuração central da landing pública — edite links e mensagens aqui */

import {
  buildWhatsAppUrl as buildClickToChatWhatsAppUrl,
  openWhatsApp,
  type WhatsAppOpenTarget,
} from '@/lib/whatsapp/clickToChat';

export const LANDING_PRESENTATION_URL =
  'https://www.youtube.com/watch?v=IM7vH2N_w2s';

/** ID do vídeo oficial de apresentação (YouTube). */
export const LANDING_PRESENTATION_VIDEO_ID = 'IM7vH2N_w2s';

export const LANDING_PRESENTATION_THUMB_MAX =
  `https://img.youtube.com/vi/${LANDING_PRESENTATION_VIDEO_ID}/maxresdefault.jpg`;

export const LANDING_PRESENTATION_THUMB_HQ =
  `https://img.youtube.com/vi/${LANDING_PRESENTATION_VIDEO_ID}/hqdefault.jpg`;

export const LANDING_PRESENTATION_DURATION = '3:40';

/** Rota pública do loteamento demonstrativo */
export const LANDING_TEST_LOTEMENT_PATH = '/demo';

export const LANDING_LOGIN_PATH = '/login';

/** Portal do Cliente público (somente leitura) — ativo com NEXT_PUBLIC_CLIENT_PORTAL_ENABLED */
export const LANDING_CLIENT_PORTAL_PATH = '/portal-cliente';

export const LANDING_WHATSAPP_NUMBER = '5594991955918';
export const LANDING_PHONE_NUMBER = '5594991612981';

export const LANDING_ADDRESS = {
  street: 'Rua 02, Quadra 123, Lote 05',
  neighborhood: 'Bairro Nova Carajás',
  city: 'Parauapebas – PA',
  cep: '68515-000',
  full: 'Rua 02, Quadra 123, Lote 05, Bairro Nova Carajás, Parauapebas – PA, CEP: 68515-000',
  lat: -6.09212,
  lng: -49.847109,
};

export const LANDING_GOOGLE_MAPS_URL =
  'https://www.google.com/maps/place/R.+2,+Parauapebas+-+PA,+68515-000/@-6.0919777,-49.8485082,1333m/data=!3m1!1e3!4m6!3m5!1s0x92dd4ffb272327e7:0xbc24d1ed4e55abfc!8m2!3d-6.09212!4d-49.847109!16s%2Fg%2F11g62s462z?authuser=0&entry=ttu';

export const LANDING_GOOGLE_MAPS_DIRECTIONS_URL =
  'https://www.google.com/maps/dir/?api=1&destination=-6.09212,-49.847109';

export const LANDING_CONTACT = {
  email: 'gerencia@nortesultopografia.com.br',
  supportEmail: 'suporte@svlotes.com.br',
  phone: '(94) 99161-2981',
  whatsapp: ['(94) 99195-5918', '(94) 98446-1415'],
  hours: 'Segunda a Sexta, 08h às 18h',
  cnpj: '12.631.238/0001-02',
  founded: '14 de setembro de 2010',
  company: 'SV Topografia e Projetos LTDA',
};

export const LANDING_WHATSAPP_MESSAGES = {
  demo: 'Olá! Gostaria de agendar uma demonstração do SV LOTES.',
  testLot: 'Olá! Gostaria de acessar o loteamento de teste do SV LOTES.',
  planBasic: 'Olá! Tenho interesse no Plano Básico do SV LOTES. Gostaria de mais informações.',
  planBusiness: 'Olá! Tenho interesse no Plano Business do SV LOTES. Gostaria de mais informações.',
  planPro: 'Olá! Tenho interesse no Plano Profissional do SV LOTES. Gostaria de mais informações.',
  contact: 'Olá! Gostaria de saber mais sobre o SV LOTES.',
  migration:
    'Olá! Gostaria de falar com a equipe sobre migração de dados para o SV LOTES.',
} as const;

export type LandingPlanId = 'basico' | 'business' | 'profissional';

export function buildWhatsAppUrl(
  message: string,
  target?: WhatsAppOpenTarget,
): string {
  return (
    buildClickToChatWhatsAppUrl(LANDING_WHATSAPP_NUMBER, message, target) || ''
  );
}

export function openLandingWhatsApp(message: string): boolean {
  return openWhatsApp(LANDING_WHATSAPP_NUMBER, message);
}

export function handleLandingWhatsAppClick(
  event: {
    preventDefault: () => void;
    ctrlKey: boolean;
    metaKey: boolean;
    button: number;
  },
  message: string,
): void {
  if (event.ctrlKey || event.metaKey || event.button !== 0) return;
  event.preventDefault();
  openLandingWhatsApp(message);
}

export type ContactFormInput = {
  name: string;
  company: string;
  phone: string;
  email: string;
  city: string;
  plan: string;
  message: string;
};

export type ContactFormFieldErrors = Partial<
  Record<'name' | 'phone' | 'message', string>
>;

export const LANDING_CONTACT_FORM_EMAIL_SUBJECT =
  'Solicitação de Demonstração - SV LOTES';

export function validateContactForm(input: ContactFormInput): ContactFormFieldErrors {
  const errors: ContactFormFieldErrors = {};
  if (!input.name.trim()) {
    errors.name = 'Informe seu nome para continuar.';
  }
  if (!input.phone.trim()) {
    errors.phone = 'Informe seu WhatsApp para continuar.';
  }
  if (!input.message.trim()) {
    errors.message = 'Escreva uma mensagem para nossa equipe.';
  }
  return errors;
}

function formatContactFormFields(input: ContactFormInput): string {
  return [
    `Nome: ${input.name.trim()}`,
    `Empresa: ${input.company.trim() || '—'}`,
    `WhatsApp: ${input.phone.trim()}`,
    `Cidade/estado: ${input.city.trim() || '—'}`,
    `E-mail: ${input.email.trim() || '—'}`,
    `Plano de interesse: ${input.plan}`,
    '',
    'Mensagem:',
    input.message.trim() || '—',
  ].join('\n');
}

export function buildContactFormWhatsAppMessage(input: ContactFormInput): string {
  return [
    'Olá, gostaria de solicitar uma demonstração do SV LOTES.',
    '',
    formatContactFormFields(input),
  ].join('\n');
}

export function buildContactFormWhatsApp(input: ContactFormInput): string {
  return buildWhatsAppUrl(buildContactFormWhatsAppMessage(input));
}

export function buildContactFormMailto(input: ContactFormInput): string {
  const body = [
    'Olá,',
    '',
    'Gostaria de solicitar uma demonstração do SV LOTES.',
    '',
    formatContactFormFields(input),
    '',
    'Atenciosamente.',
  ].join('\n');

  return `mailto:${LANDING_CONTACT.email}?subject=${encodeURIComponent(LANDING_CONTACT_FORM_EMAIL_SUBJECT)}&body=${encodeURIComponent(body)}`;
}

export const LANDING_CLIENTS = [
  'SV Topografia & Projetos',
  'Meneses Imobiliária',
  'Chacreamento Recanto Primavera',
  'Vila das Chácaras',
  'LF Imóveis',
] as const;

/** Clientes ativos exibidos na seção de confiança da landing. */
export const LANDING_TRUSTED_COMPANIES: Array<{
  name: string;
  description: string;
  src: string;
  width: number;
  height: number;
}> = [
  {
    name: 'Meneses Imobiliária',
    description: 'Gestão completa de loteamentos urbanos.',
    src: '/landing/clients/meneses.png',
    width: 320,
    height: 200,
  },
  {
    name: 'Chacreamento Recanto Primavera',
    description: 'Loteamento rural administrado pelo SV LOTES.',
    src: '/landing/clients/recanto-primavera.png',
    width: 320,
    height: 220,
  },
  {
    name: 'Vila das Chácaras',
    description: 'Gestão comercial e financeira integrada.',
    src: '/landing/clients/vila-chacaras.png',
    width: 360,
    height: 180,
  },
  {
    name: 'LF Imóveis',
    description: 'Imobiliária parceira utilizando o SV LOTES.',
    src: '/landing/clients/lf-imoveis.png',
    width: 280,
    height: 200,
  },
];

/** @deprecated use LANDING_TRUSTED_COMPANIES */
export const LANDING_CLIENT_LOGOS = LANDING_TRUSTED_COMPANIES.map(({ name, src, width, height }) => ({
  name,
  src,
  width,
  height,
}));

/** Experiência verificável — não inventar métricas de escala. */
export const LANDING_EXPERIENCE_LINE =
  'Tecnologia desenvolvida a partir de mais de 15 anos de experiência em topografia, loteamentos e gestão imobiliária.';

/** Galeria Sobre — apenas imagens alinhadas ao texto (sem legendas incompatíveis). */
export const LANDING_ABOUT_PHOTOS = [
  {
    src: '/landing/logo.png',
    alt: 'SV Topografia e Projetos — identidade da empresa',
    caption: 'SV Topografia & Projetos — Parauapebas, PA',
  },
  {
    src: '/landing/product/masked/mapa-gis.webp',
    alt: 'Mapa GIS do SV LOTES desenvolvido a partir da experiência em loteamentos',
    caption: 'Plataforma criada por quem vive o mercado de loteamentos',
  },
] as const;

/** Recursos em destaque nos cards de plano (lista completa permanece expansível). */
export const LANDING_PLAN_HIGHLIGHT_FEATURES = [
  'Mapa GIS Interativo',
  'Contratos Automáticos',
  'Controle Financeiro',
  'Assinatura Digital de Contratos',
  'Portal do Cliente',
  'Emissão de Boletos e PIX',
] as const;

export const LANDING_INCLUDED_FEATURES = [
  'Mapa GIS Interativo',
  'Controle de Lotes',
  'Cadastro de Clientes e Corretores',
  'Contratos Automáticos',
  'Parcelamento e Geração de Parcelas',
  'Controle Financeiro',
  'Comissão de Corretores',
  'Relatórios Financeiros e Gerenciais',
  'Dashboard Executivo',
  'Prancha Individual Automática',
  'Prancha Geral do Empreendimento',
  'Memorial Descritivo Automático',
  'Histórico de Alterações e Log',
  'Backup Automático',
  'Importação Civil 3D',
  'Fluxo de Caixa Projetado',
  'Assinatura Digital de Contratos',
  'API para Integrações',
  'Cobrança Automática por E-mail/WhatsApp',
  'Emissão de Boletos e PIX',
  'Portal do Cliente',
  'Login por CPF',
  'Autenticação via WhatsApp',
  'Visualização de Contratos',
  'Download de PDF',
  'Consulta de Parcelas',
  'Acompanhamento Online',
] as const;
