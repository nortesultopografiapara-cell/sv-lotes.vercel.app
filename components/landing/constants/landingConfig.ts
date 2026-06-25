/** Configuração central da landing pública — edite links e mensagens aqui */

export const LANDING_PRESENTATION_URL =
  'https://www.youtube.com/watch?v=u7Z7uCLGP6U';

/** Rota pública do loteamento demonstrativo */
export const LANDING_TEST_LOTEMENT_PATH = '/demo';

export const LANDING_LOGIN_PATH = '/login';

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
} as const;

export type LandingPlanId = 'basico' | 'business' | 'profissional';

export function buildWhatsAppUrl(message: string): string {
  return `https://wa.me/${LANDING_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export type ContactFormInput = {
  name: string;
  company: string;
  phone: string;
  email: string;
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
    `E-mail: ${input.email.trim() || '—'}`,
    `Plano de interesse: ${input.plan}`,
    '',
    'Mensagem:',
    input.message.trim(),
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

/** Logos exibidos no hero — substitua por PNGs reais em public/landing/clients/ quando disponíveis. */
export const LANDING_CLIENT_LOGOS: Array<{
  name: string;
  src: string;
  width: number;
  height: number;
}> = [
  { name: 'SV Topografia & Projetos', src: '/landing/logo.png', width: 140, height: 52 },
  { name: 'Meneses Imobiliária', src: '/landing/clients/meneses.svg', width: 120, height: 48 },
  {
    name: 'Chacreamento Recanto Primavera',
    src: '/landing/clients/recanto-primavera.svg',
    width: 150,
    height: 48,
  },
  { name: 'Vila das Chácaras', src: '/landing/clients/vila-chacaras.svg', width: 130, height: 48 },
  { name: 'LF Imóveis', src: '/landing/clients/lf-imoveis.svg', width: 110, height: 48 },
];

/** Métricas exibidas na seção Benefícios (percepção de escala). */
export const LANDING_STATS = [
  { value: 100, suffix: '+', label: 'empreendimentos cadastrados' },
  { value: 10000, suffix: '+', label: 'lotes gerenciados' },
  { value: 0, suffix: '', label: 'milhares de parcelas controladas', textOnly: true },
] as const;

/** Galeria Sobre — substitua por fotos reais em public/landing/about/ quando disponíveis. */
export const LANDING_ABOUT_PHOTOS = [
  {
    src: '/landing/logo.png',
    alt: 'SV Topografia e Projetos — sede e identidade da empresa',
    caption: 'Sede SV Topografia & Projetos — Parauapebas, PA',
  },
  {
    src: '/landing/02.png',
    alt: 'Levantamento de campo e mapa GIS de loteamento',
    caption: 'Levantamentos de campo com GNSS RTK de alta precisão',
  },
  {
    src: '/landing/06.png',
    alt: 'Tecnologia de precisão e operações de topografia',
    caption: 'Drone e equipamentos de precisão para projetos',
  },
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
] as const;

export const LANDING_ROADMAP_FEATURES = [
  'API para Integrações',
  'Aplicativo do Cliente',
  'Integração com Contabilidade',
  'Cobrança Automática por E-mail/WhatsApp',
  'Emissão de Boletos e PIX',
] as const;
