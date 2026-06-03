export type ManualSection = {
  id: string;
  title: string;
  summary: string;
  items: string[];
};

export const MANUAL_SECTIONS: ManualSection[] = [
  {
    id: 'intro',
    title: 'Introdução ao SV LOTES',
    summary: 'Visão geral do sistema e fluxo operacional principal.',
    items: [
      'O SV LOTES é uma plataforma de gestão imobiliária para loteamentos, com mapa GIS em tempo real.',
      'Centraliza projeto, lotes, vendas, contratos, parcelas e financeiro em um único ambiente.',
      'Fluxo principal: Projeto → Mapa GIS → Lote → Venda → Contrato → Parcelas → Financeiro.',
      'Use o mapa GIS como ponto central da operação diária.',
    ],
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    summary: 'Indicadores, lotes e resultados financeiros.',
    items: [
      'Acesse o Dashboard pelo menu lateral para ver o panorama do empreendimento selecionado.',
      'Visualize indicadores de lotes disponíveis, reservados e vendidos.',
      'Acompanhe VGV, recebimentos do mês e inadimplência.',
      'Confira atividades recentes e o mapa resumido do empreendimento.',
      'Selecione o projeto no topo quando houver mais de um loteamento.',
    ],
  },
  {
    id: 'mapa',
    title: 'Mapa GIS',
    summary: 'Visualização, cores e vendas pelo mapa.',
    items: [
      'Abra Mapa GIS e selecione o loteamento (projeto) desejado.',
      'Verde = disponível · Amarelo = reservado · Vermelho = vendido.',
      'Clique em um lote para ver detalhes e iniciar ações comerciais.',
      'Use as ferramentas laterais para importar quadras, medição, GPS e prancha do lote.',
      'Inicie a venda diretamente pelo mapa após selecionar o lote.',
    ],
  },
  {
    id: 'clientes',
    title: 'Clientes',
    summary: 'Cadastro, consulta e vínculo com lotes.',
    items: [
      'Cadastre clientes com dados completos (nome, documento, contato).',
      'Consulte a ficha do cliente para histórico e vínculos.',
      'Vincule o cliente ao lote durante a venda ou no fluxo do contrato.',
      'Mantenha o cadastro atualizado antes de gerar contratos.',
    ],
  },
  {
    id: 'corretores',
    title: 'Corretores',
    summary: 'Equipe comercial, vendas e comissões.',
    items: [
      'Cadastre corretores com perfil e dados de contato.',
      'Acompanhe vendas do mês e ranking no painel de corretores.',
      'Visualize comissões pagas e pendentes por corretor.',
      'Use filtros e busca para localizar corretores rapidamente.',
    ],
  },
  {
    id: 'contratos',
    title: 'Contratos',
    summary: 'Geração, PDF, carnê e cancelamento.',
    items: [
      'Gere o contrato após concluir a venda e validar cliente e parcelas.',
      'Regenere o contrato quando houver alteração nos dados do negócio.',
      'Baixe o PDF do contrato para impressão ou envio ao cliente.',
      'Gere o carnê de parcelas a partir do contrato ativo.',
      'Cancele o contrato somente quando a operação exigir (ação irreversível na prática comercial).',
    ],
  },
  {
    id: 'financeiro',
    title: 'Financeiro',
    summary: 'Parcelas, pagamentos, inadimplência e recibos.',
    items: [
      'Consulte parcelas por contrato, status e período.',
      'Registre pagamentos informando data, valor e forma.',
      'Monitore inadimplência e parcelas a vencer nos alertas e filtros.',
      'Gere recibos após confirmar o recebimento.',
      'Registre saídas e despesas para manter o fluxo de caixa coerente.',
    ],
  },
  {
    id: 'configuracoes',
    title: 'Configurações',
    summary: 'Identidade visual, assinatura e aparência.',
    items: [
      'Altere a logo da empresa em Configurações.',
      'Envie ou atualize a assinatura usada nos documentos.',
      'Escolha tema claro ou escuro em Aparência.',
      'Defina a cor institucional (laranja, azul, verde ou roxo).',
    ],
  },
  {
    id: 'dicas',
    title: 'Dicas rápidas',
    summary: 'Boas práticas para operar sem erros.',
    items: [
      'Cadastre o projeto antes de importar lotes no mapa.',
      'Confira o cliente antes de gerar o contrato.',
      'Valide parcelas e valores antes de finalizar a venda.',
      'Use o mapa GIS como referência principal da operação.',
      'Mantenha dados de corretores e comissões atualizados.',
    ],
  },
];

export function filterManualSections(query: string): ManualSection[] {
  const q = query.trim().toLowerCase();
  if (!q) return MANUAL_SECTIONS;
  return MANUAL_SECTIONS.filter((section) => {
    const haystack = [section.title, section.summary, ...section.items].join(' ').toLowerCase();
    return haystack.includes(q);
  }).map((section) => {
    const itemMatches = section.items.filter((item) => item.toLowerCase().includes(q));
    if (
      section.title.toLowerCase().includes(q) ||
      section.summary.toLowerCase().includes(q) ||
      itemMatches.length === 0
    ) {
      return section;
    }
    return { ...section, items: itemMatches };
  });
}
