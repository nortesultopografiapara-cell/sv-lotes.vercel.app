/** Prints reais do sistema — cópias mascaradas para uso público na landing. */

export const PRODUCT_SHOTS = {
  dashboard: {
    src: '/landing/product/masked/dashboard.webp',
    fallback: '/landing/product/masked/dashboard.png',
    alt: 'Dashboard executivo do SV LOTES com indicadores de lotes e financeiro',
    caption: 'Dashboard executivo',
  },
  projetos: {
    src: '/landing/product/masked/projetos.webp',
    fallback: '/landing/product/masked/projetos.png',
    alt: 'Lista de empreendimentos e projetos no SV LOTES',
    caption: 'Empreendimentos e projetos',
  },
  mapaGis: {
    src: '/landing/product/masked/mapa-gis.webp',
    fallback: '/landing/product/masked/mapa-gis.png',
    alt: 'Mapa GIS do SV LOTES com lotes disponíveis, reservados e vendidos',
    caption: 'Mapa GIS Inteligente',
  },
  clientes: {
    src: '/landing/product/masked/clientes.webp',
    fallback: '/landing/product/masked/clientes.png',
    alt: 'Gestão de clientes no SV LOTES',
    caption: 'Gestão de clientes',
  },
  corretores: {
    src: '/landing/product/masked/corretores.webp',
    fallback: '/landing/product/masked/corretores.png',
    alt: 'Gestão de corretores e comissões no SV LOTES',
    caption: 'Corretores e comissões',
  },
  financeiro: {
    src: '/landing/product/masked/financeiro.webp',
    fallback: '/landing/product/masked/financeiro.png',
    alt: 'Módulo financeiro do SV LOTES',
    caption: 'Módulo financeiro',
  },
  cobrancas: {
    src: '/landing/product/masked/cobrancas.webp',
    fallback: '/landing/product/masked/cobrancas.png',
    alt: 'Central de cobranças do SV LOTES',
    caption: 'Central de cobranças',
  },
  contratoAssinado: {
    src: '/landing/product/masked/contrato-assinado.webp',
    fallback: '/landing/product/masked/contrato-assinado.png',
    alt: 'Contrato com assinatura eletrônica no SV LOTES',
    caption: 'Assinatura eletrônica',
  },
  contratoVersoes: {
    src: '/landing/product/masked/contrato-versoes.webp',
    fallback: '/landing/product/masked/contrato-versoes.png',
    alt: 'Visualização e histórico de versões de contratos no SV LOTES',
    caption: 'Contratos e versões',
  },
  migracao: {
    src: '/landing/product/masked/migracao.webp',
    fallback: '/landing/product/masked/migracao.png',
    alt: 'Assistente de migração de dados do SV LOTES',
    caption: 'Migração de dados',
  },
  vendaModal: {
    src: '/landing/product/masked/venda-modal.webp',
    fallback: '/landing/product/masked/venda-modal.png',
    alt: 'Modal de venda de lote no SV LOTES',
    caption: 'Venda pelo mapa',
  },
  portal: {
    src: '/landing/07.png',
    fallback: '/landing/07.png',
    alt: 'Portal do Cliente do SV LOTES',
    caption: 'Portal do Cliente',
  },
} as const;

export type ProductShotKey = keyof typeof PRODUCT_SHOTS;
