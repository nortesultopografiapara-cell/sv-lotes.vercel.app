/**
 * Seções e conteúdo do manual SV LOTES.
 */

import { trainingHaystack } from '@/lib/manualTraining';

export type ManualBadgeId =
  | 'venda'
  | 'financeiro'
  | 'contrato'
  | 'mapa'
  | 'cliente'
  | 'corretor'
  | 'configuracao'
  | 'documento'
  | 'assinatura';

export type ManualSection = {
  id: string;
  title: string;
  subtitle: string;
  summary: string;
  badges: ManualBadgeId[];
  whereToFind: string;
  purpose: string;
  steps: string[];
  tips: string[];
  keywords?: string[];
};

export type ManualFaqItem = {
  id: string;
  question: string;
  answer: string;
  keywords?: string[];
};

export const MANUAL_BADGE_LABELS: Record<ManualBadgeId, string> = {
  venda: 'Venda',
  financeiro: 'Financeiro',
  contrato: 'Contrato',
  mapa: 'Mapa',
  cliente: 'Cliente',
  corretor: 'Corretor',
  configuracao: 'Configuração',
  documento: 'Documento',
  assinatura: 'Assinatura',
};

export const MANUAL_SECTIONS: ManualSection[] = [
  {
    id: 'intro',
    title: 'Introdução ao SV LOTES',
    subtitle: 'O que é o sistema e como ele organiza sua operação',
    summary:
      'Plataforma completa para loteadoras e imobiliárias gerenciarem empreendimentos do mapa ao financeiro.',
    badges: ['mapa', 'venda', 'contrato', 'financeiro'],
    whereToFind: 'Acesse pelo menu lateral após o login. O Dashboard e o Mapa GIS são os pontos de partida.',
    purpose:
      'O SV LOTES centraliza todo o ciclo do loteamento: cadastro do empreendimento, visualização no mapa, vendas, contratos, parcelas, recebimentos, corretores, proprietários, assinatura eletrônica e documentos automáticos (memorial, pranchas, carnê e recibo).',
    steps: [
      'Faça login e escolha a empresa (quando aplicável).',
      'Selecione o projeto/loteamento no topo da tela.',
      'Use o Mapa GIS como referência principal para lotes disponíveis, reservados e vendidos.',
      'Conduza a venda pelo lote → gere contrato → acompanhe parcelas no Financeiro.',
      'Envie contratos para assinatura eletrônica e acompanhe o status até a conclusão.',
    ],
    tips: [
      'Pense no fluxo: Projeto → Mapa → Lote → Venda → Contrato → Parcelas → Financeiro.',
      'Mantenha dados da empresa e do cliente completos antes de gerar documentos.',
      'O mapa GIS é o coração da operação — use-o diariamente.',
    ],
    keywords: ['sv lotes', 'sistema', 'loteamento', 'gis', 'introdução'],
  },
  {
    id: 'primeiro-acesso',
    title: 'Primeiro acesso',
    subtitle: 'Login, empresa, projeto e perfis de usuário',
    summary: 'Como entrar no sistema e entender o que cada perfil pode fazer.',
    badges: ['configuracao'],
    whereToFind: 'Tela de login em /login. Após autenticar, o menu lateral mostra os módulos liberados para seu perfil.',
    purpose:
      'Garantir que cada usuário acesse a empresa e o empreendimento corretos, com permissões adequadas ao seu papel na operação.',
    steps: [
      'Acesse o endereço do sistema e informe e-mail e senha.',
      'Se houver mais de uma empresa, selecione a empresa desejada.',
      'No topo do Dashboard ou do Mapa, escolha o projeto/loteamento ativo.',
      'ADMIN: acesso completo à empresa (vendas, contratos, financeiro, configurações).',
      'CORRETOR: foco no Mapa GIS para vender e reservar lotes.',
      'PROPRIETÁRIO (OWNER): visualização de vendas e lotes — sem alterar dados.',
      'SUPER ADMIN: gestão SaaS de todas as empresas (painel Master).',
    ],
    tips: [
      'Corretores devem usar principalmente o Mapa GIS no celular em campo.',
      'Proprietários veem relatórios, mas não registram pagamentos nem editam vendas.',
      'Troque de projeto antes de operar para não vender lote do empreendimento errado.',
    ],
    keywords: ['login', 'acesso', 'admin', 'corretor', 'proprietário', 'perfil', 'empresa'],
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    subtitle: 'Indicadores e panorama do empreendimento',
    summary: 'Visão geral de lotes, vendas, recebimentos e atividades recentes.',
    badges: ['mapa', 'financeiro', 'venda'],
    whereToFind: 'Menu lateral → Dashboard (/dashboard).',
    purpose:
      'Acompanhar rapidamente a saúde comercial e financeira do loteamento selecionado sem precisar abrir cada módulo.',
    steps: [
      'Selecione o projeto no seletor superior quando houver mais de um empreendimento.',
      'Confira o total de lotes e a divisão: disponíveis, reservados e vendidos.',
      'Veja o VGV (valor geral de vendas) do empreendimento.',
      'Acompanhe recebimentos do período e o índice de inadimplência.',
      'Leia as atividades recentes (vendas, pagamentos, contratos).',
      'Use o mapa resumido ou atalhos para ir ao Mapa GIS ou Financeiro.',
    ],
    tips: [
      'Compare disponíveis x vendidos para planejar campanhas comerciais.',
      'Inadimplência alta no Dashboard merece ação imediata no Financeiro.',
      'Atualize a página após grandes operações para ver números recentes.',
    ],
    keywords: ['dashboard', 'indicadores', 'vgv', 'inadimplência', 'lotes', 'recebimentos'],
  },
  {
    id: 'mapa',
    title: 'Mapa GIS',
    subtitle: 'Operação principal — lotes, cores e documentos no mapa',
    summary: 'Visualize, venda e gere documentos diretamente pelo mapa interativo.',
    badges: ['mapa', 'venda', 'documento'],
    whereToFind: 'Menu lateral → Mapa GIS (/map).',
    purpose:
      'O mapa é o núcleo do SV LOTES. Por ele você identifica status dos lotes, inicia vendas, gera memorial e pranchas e importa geometrias.',
    steps: [
      'Abra o Mapa GIS e selecione o loteamento no seletor de projeto.',
      'Entenda as cores: verde = disponível, amarelo = reservado, vermelho = vendido.',
      'Clique em um lote para abrir o painel com dados (quadra, número, área, confrontações).',
      'Para vender: clique em um lote verde → Vender ou Reservar.',
      'Gere memorial descritivo e prancha individual pelo painel do lote.',
      'Gere prancha geral do empreendimento pelas ferramentas do mapa.',
      'Importe quadras e lotes via KML, TXT ou Shapefile quando configurado.',
      'Use a barra lateral: medição, GPS, guias de logradouro, confrontações.',
      'Identifique frentes, fundos e laterais nas ferramentas de confrontação.',
      'Alterne visualização de mapa base, satélite ou híbrido no controle de camadas.',
    ],
    tips: [
      'Cadastre o projeto antes de importar lotes.',
      'Confira confrontações no mapa — elas alimentam memorial e contrato.',
      'Lote reservado (amarelo) pode voltar a disponível se a reserva expirar ou for cancelada.',
    ],
    keywords: ['mapa', 'gis', 'lote', 'verde', 'amarelo', 'vermelho', 'memorial', 'prancha', 'importar', 'satélite'],
  },
  {
    id: 'clientes',
    title: 'Clientes',
    subtitle: 'Cadastro completo e vínculo com vendas',
    summary: 'Gerencie compradores com dados corretos para contrato e assinatura.',
    badges: ['cliente', 'contrato', 'assinatura'],
    whereToFind: 'Menu lateral → Clientes (/customers).',
    purpose:
      'Manter cadastro único de compradores, com documentos e contatos válidos para contratos, carnês e assinatura eletrônica.',
    steps: [
      'Clique em Novo cliente ou cadastre durante a venda pelo mapa.',
      'Preencha: nome completo, CPF/CNPJ, RG, órgão emissor, endereço, telefone e e-mail.',
      'Salve e confira a ficha antes de gerar contrato.',
      'Edite dados pelo menu de ações do cliente quando houver correção.',
      'Consulte histórico de vendas e contratos vinculados na ficha.',
      'Na venda, selecione cliente existente ou cadastre um novo sem sair do fluxo.',
    ],
    tips: [
      'E-mail válido é obrigatório para enviar contrato à assinatura eletrônica.',
      'CPF/CNPJ incorreto impede geração correta do contrato.',
      'Atualize endereço e telefone antes de regenerar contrato.',
    ],
    keywords: ['cliente', 'cpf', 'cnpj', 'cadastro', 'e-mail', 'assinatura'],
  },
  {
    id: 'corretores',
    title: 'Corretores',
    subtitle: 'Equipe comercial, comissões e ranking',
    summary: 'Cadastre e acompanhe corretores, gerentes e assistentes.',
    badges: ['corretor', 'venda', 'financeiro'],
    whereToFind: 'Menu lateral → Corretores (/dashboard/brokers).',
    purpose:
      'Organizar a equipe de vendas, registrar comissões e acompanhar desempenho por corretor.',
    steps: [
      'Cadastre corretor com nome, CRECI (quando aplicável), telefone e e-mail.',
      'Defina percentual ou regra de comissão conforme política da imobiliária.',
      'Acompanhe ranking de vendas e volume no painel de corretores.',
      'Veja comissões pagas e pendentes por venda.',
      'Ative ou desative corretor sem apagar histórico.',
      'Corretor: executa vendas. Gerente: supervisiona equipe. Assistente: apoio administrativo (conforme perfil configurado).',
    ],
    tips: [
      'Vincule o corretor correto na venda — isso alimenta comissões automaticamente.',
      'Desative corretores que saíram da equipe para não aparecerem em novas vendas.',
      'Confira CRECI no contrato quando exigido pelo modelo.',
    ],
    keywords: ['corretor', 'comissão', 'ranking', 'creci', 'gerente'],
  },
  {
    id: 'venda',
    title: 'Venda de lote',
    subtitle: 'Passo a passo completo da venda pelo mapa',
    summary: 'Do clique no lote até a geração de contrato e parcelas.',
    badges: ['venda', 'mapa', 'cliente', 'contrato', 'financeiro'],
    whereToFind: 'Mapa GIS → clique no lote disponível (verde) → Vender ou Reservar.',
    purpose:
      'Registrar a negociação comercial de forma estruturada, gerando automaticamente venda, parcelas e contrato.',
    steps: [
      'Entre no Mapa GIS e selecione o loteamento.',
      'Clique em um lote disponível (verde).',
      'Escolha Vender (ou Reservar para bloquear temporariamente).',
      'Selecione cliente existente ou cadastre novo comprador.',
      'Selecione o corretor responsável pela venda.',
      'Informe o valor total da venda.',
      'Informe desconto, se houver.',
      'Informe entrada/sinal, se houver.',
      'Defina quantidade de parcelas e valor de cada uma (ou deixe o sistema calcular).',
      'Informe vencimento da primeira parcela.',
      'Escolha correção das parcelas: sem correção, fixa, IPCA, IGP-M ou INCC.',
      'Confira o resumo financeiro (entrada + parcelas = total).',
      'Confirme a venda.',
      'O sistema cria cliente (se novo), venda, parcelas no financeiro e contrato em rascunho/pendente.',
    ],
    tips: [
      'Revise parcelas antes de confirmar — alterações posteriores exigem regenerar contrato.',
      'Reserva amarela no mapa evita venda duplicada do mesmo lote.',
      'Entrada e desconto impactam diretamente o carnê e o fluxo de caixa.',
    ],
    keywords: ['venda', 'lote', 'parcelas', 'entrada', 'desconto', 'ipca', 'igpm', 'incc', 'reservar'],
  },
  {
    id: 'contratos',
    title: 'Contratos',
    subtitle: 'Geração, PDF, assinatura eletrônica e carnê',
    summary: 'Gerencie todo o ciclo do contrato de compra e venda.',
    badges: ['contrato', 'assinatura', 'documento', 'financeiro'],
    whereToFind: 'Menu lateral → Contratos (/contracts).',
    purpose:
      'Formalizar a venda em documento legal, coletar assinaturas eletrônicas e disponibilizar PDF e carnê ao comprador.',
    steps: [
      'Abra Contratos e localize o contrato pelo número, cliente ou lote.',
      'Confira o status: Pendente, Ativo, Assinado, Cancelado, etc.',
      'Ative o contrato quando a venda estiver confirmada (se aplicável).',
      'Gere ou regenere o contrato após alterar dados da venda ou do cliente.',
      'Baixe o PDF para impressão ou arquivo.',
      'Envie para assinatura eletrônica — o comprador recebe link por WhatsApp ou e-mail.',
      'Comprador assina primeiro pelo link público.',
      'Depois, admin assina como vendedor/representante da imobiliária no sistema.',
      'Após assinatura bilateral, baixe o PDF assinado e o certificado.',
      'Gere carnê de parcelas a partir do contrato ativo.',
      'Cancele somente quando a operação comercial exigir (ação sensível).',
      'O certificado eletrônico registra IP, data/hora, navegador, hash e evidências de cada signatário.',
    ],
    tips: [
      'Regenere contrato sempre que mudar valor, parcelas ou dados do comprador.',
      'Confira e-mail do comprador antes de enviar assinatura.',
      'Assinatura do vendedor só libera após o comprador assinar.',
    ],
    keywords: ['contrato', 'pdf', 'assinatura', 'carnê', 'regenerar', 'certificado', 'hash', 'vendedor', 'comprador'],
  },
  {
    id: 'financeiro',
    title: 'Financeiro',
    subtitle: 'Parcelas, recebimentos, inadimplência e recibos',
    summary: 'Controle todas as parcelas geradas pelas vendas.',
    badges: ['financeiro', 'contrato', 'cliente'],
    whereToFind: 'Menu lateral → Financeiro (/finance).',
    purpose:
      'Registrar pagamentos, acompanhar vencimentos, inadimplência e emitir recibos por projeto e cliente.',
    steps: [
      'Abra Financeiro e selecione o projeto/loteamento quando necessário.',
      'Visualize parcelas em aberto, pagas, vencidas e a vencer.',
      'Use filtros por cliente, lote, vencimento e status.',
      'Clique em uma parcela para registrar pagamento (data, valor, forma).',
      'Baixe boleto ou segunda via quando disponível.',
      'Gere recibo PDF após confirmar recebimento.',
      'Monitore inadimplência nos indicadores e listas de vencidas.',
      'Antecipe parcelas a vencer para planejamento de caixa.',
    ],
    tips: [
      'Pagamento registrado alimenta automaticamente o Fluxo de Caixa.',
      'Filtre por lote para conferir situação de um comprador específico.',
      'Parcelas vencidas aparecem em destaque — priorize contato com o cliente.',
    ],
    keywords: ['financeiro', 'parcelas', 'pagamento', 'recibo', 'inadimplência', 'vencimento', 'boleto'],
  },
  {
    id: 'fluxo-caixa',
    title: 'Fluxo de Caixa',
    subtitle: 'Entradas, saídas e saldo do empreendimento',
    summary: 'Acompanhe o caixa real com recebimentos e despesas.',
    badges: ['financeiro'],
    whereToFind: 'Financeiro → Fluxo de Caixa (ou atalho no menu Financeiro).',
    purpose:
      'Ter visão consolidada de entradas (recebimentos de parcelas) e saídas (despesas manuais) para saber o saldo disponível.',
    steps: [
      'Acesse Financeiro e abra a aba ou seção Fluxo de Caixa.',
      'Entradas são registradas automaticamente ao confirmar recebimentos de parcelas.',
      'Lance despesas/saídas manualmente com data, valor, categoria e descrição.',
      'Filtre por período (mês, trimestre ou intervalo personalizado).',
      'Confira total de entradas, total de saídas e saldo do período.',
      'Exporte relatório para planilha ou PDF quando disponível.',
      'Use para reuniões com sócios e planejamento do loteamento.',
    ],
    tips: [
      'Registre despesas operacionais (marketing, manutenção) para saldo realista.',
      'Compare fluxo de caixa com inadimplência do Dashboard.',
      'Revise lançamentos manuais mensalmente para evitar duplicidade.',
    ],
    keywords: ['fluxo de caixa', 'entradas', 'saídas', 'saldo', 'despesas', 'exportar'],
  },
  {
    id: 'minha-assinatura',
    title: 'Minha Assinatura',
    subtitle: 'Plano SV LOTES, cobranças e pagamento',
    summary: 'Acompanhe sua assinatura do software SV LOTES.',
    badges: ['configuracao', 'financeiro'],
    whereToFind: 'Menu → Minha Assinatura ou /billing (conforme perfil ADMIN).',
    purpose:
      'Visualizar plano contratado, vencimentos, cobranças PIX/boleto e histórico de pagamentos do SaaS.',
    steps: [
      'Abra Minha Assinatura para ver plano, status e próximo vencimento.',
      'Consulte cobranças em aberto e pagas.',
      'Use Atualizar para sincronizar status com o gateway.',
      'Abra link de pagamento, copie link ou copie código PIX.',
      'Pague via PIX ou boleto antes do vencimento para evitar suspensão.',
      'Veja histórico de faturas e comprovantes.',
    ],
    tips: [
      'Mantenha e-mail da empresa atualizado para receber lembretes de cobrança.',
      'Em caso de suspensão, regularize o pagamento e aguarde reativação automática.',
      'SUPER ADMIN gerencia planos pelo painel Master SaaS.',
    ],
    keywords: ['assinatura', 'plano', 'pix', 'boleto', 'cobrança', 'saas', 'billing'],
  },
  {
    id: 'socios-proprietarios',
    title: 'Sócios / Proprietários',
    subtitle: 'Acesso de leitura para donos do empreendimento',
    summary: 'Cadastre proprietários com visão restrita de vendas e lotes.',
    badges: ['cliente', 'configuracao', 'mapa'],
    whereToFind: 'Menu lateral → Proprietários (/owners) — perfil ADMIN.',
    purpose:
      'Permitir que sócios ou proprietários do loteamento acompanhem resultados sem alterar vendas, contratos ou financeiro.',
    steps: [
      'Cadastre proprietário com nome, e-mail e dados de acesso.',
      'Vincule o proprietário aos projetos/loteamentos que ele pode visualizar.',
      'O perfil OWNER acessa Dashboard, mapa e relatórios em modo leitura.',
      'Proprietário vê vendas realizadas e status dos lotes do projeto liberado.',
      'Não pode cadastrar venda, registrar pagamento nem editar contratos.',
    ],
    tips: [
      'Ideal para investidores que acompanham o empreendimento à distância.',
      'Revise projetos vinculados ao criar ou desligar um sócio.',
      'Proprietário usa o mesmo login, com permissões diferentes do ADMIN.',
    ],
    keywords: ['proprietário', 'sócio', 'owner', 'leitura', 'acesso'],
  },
  {
    id: 'sincronizacao-offline',
    title: 'Sincronização Offline',
    subtitle: 'Trabalhar em campo sem internet estável',
    summary: 'Baixe dados para usar offline e sincronize depois.',
    badges: ['mapa', 'configuracao'],
    whereToFind: 'Menu lateral → Sincronização Offline (/offline-sync).',
    purpose:
      'Permitir consulta e operações limitadas no mapa e cadastros quando a conexão é fraca ou inexistente em campo.',
    steps: [
      'Com internet ativa, abra Sincronização Offline.',
      'Baixe/sincronize o projeto desejado antes de ir a campo.',
      'Use o mapa e consultas offline conforme disponível no dispositivo.',
      'Ao recuperar conexão, execute Sincronizar para enviar alterações ao servidor.',
      'Aguarde confirmação de sincronização concluída antes de fechar o navegador.',
    ],
    tips: [
      'Sempre sincronize na base (escritório) antes e depois da visita ao loteamento.',
      'Evite duas pessoas editando o mesmo lote offline ao mesmo tempo.',
      'Conflitos são resolvidos priorizando o servidor — confira após sync.',
    ],
    keywords: ['offline', 'sincronização', 'campo', 'internet'],
  },
  {
    id: 'configuracoes',
    title: 'Configurações',
    subtitle: 'Identidade da empresa e aparência do sistema',
    summary: 'Dados que aparecem em contratos, recibos e documentos.',
    badges: ['configuracao', 'contrato', 'documento'],
    whereToFind: 'Menu lateral → Configurações (/settings).',
    purpose:
      'Centralizar logo, assinatura, responsável legal, endereço e tema visual usados em todo o sistema.',
    steps: [
      'Atualize razão social, CNPJ e endereço da empresa.',
      'Envie logo em boa resolução para contratos e recibos.',
      'Cadastre assinatura digitalizada do responsável (quando usada em PDF).',
      'Preencha nome e CPF do representante legal para contratos.',
      'Atualize telefone e e-mail de contato da imobiliária.',
      'Em Aparência, escolha tema claro ou escuro.',
      'Defina cor institucional (laranja, azul, verde, roxo) do painel.',
    ],
    tips: [
      'Dados incompletos geram contratos com campos “Não informado”.',
      'Altere logo antes de regenerar contratos em massa.',
      'E-mail da empresa recebe cópias de algumas notificações do sistema.',
    ],
    keywords: ['configurações', 'logo', 'tema', 'empresa', 'responsável', 'cor'],
  },
  {
    id: 'documentos-automaticos',
    title: 'Documentos automáticos',
    subtitle: 'Memorial, pranchas, contrato, carnê e certificados',
    summary: 'O que o sistema gera automaticamente a partir do mapa e da venda.',
    badges: ['documento', 'mapa', 'contrato', 'assinatura'],
    whereToFind: 'Mapa GIS (memorial/pranchas), Contratos (contrato/carnê), Financeiro (recibo), link de assinatura (certificado).',
    purpose:
      'Reduzir trabalho manual com documentos técnicos e comerciais padronizados e rastreáveis.',
    steps: [
      'Memorial descritivo: painel do lote no mapa → Memorial (padrão SIGEF/INCRA).',
      'Prancha individual: painel do lote → Prancha do lote.',
      'Prancha geral: ferramentas do mapa → Prancha do empreendimento.',
      'Contrato: gerado na venda e disponível em Contratos.',
      'Carnê: Contratos → Gerar carnê das parcelas.',
      'Recibo: Financeiro → após registrar pagamento → Gerar recibo.',
      'Certificado de assinatura: emitido após assinatura eletrônica completa (comprador + vendedor).',
    ],
    tips: [
      'Confrontações corretas no mapa melhoram memorial e prancha.',
      'Regenere contrato se alterar dados da venda após a primeira geração.',
      'Certificado traz hash e evidências para validação em /verify.',
    ],
    keywords: ['memorial', 'prancha', 'contrato', 'carnê', 'recibo', 'certificado', 'documento'],
  },
  {
    id: 'dicas',
    title: 'Dicas rápidas',
    subtitle: 'Boas práticas para operar sem erros',
    summary: 'Checklist do dia a dia para imobiliárias e loteadoras.',
    badges: ['configuracao', 'venda', 'mapa'],
    whereToFind: 'Referência geral — aplique em todos os módulos.',
    purpose: 'Evitar retrabalho, contratos inválidos e inadimplência por falta de conferência.',
    steps: [
      'Cadastre o projeto antes de importar lotes no mapa.',
      'Conferir cliente (CPF, e-mail, endereço) antes de gerar contrato.',
      'Conferir parcelas e valores antes de finalizar a venda.',
      'Manter dados da empresa completos em Configurações.',
      'Usar o Mapa GIS como operação principal — não vender “no papel” sem registrar.',
      'Regenerar contrato quando alterar dados da venda ou do comprador.',
      'Validar e-mail do comprador antes de enviar assinatura eletrônica.',
      'Registrar pagamentos no Financeiro no mesmo dia do recebimento.',
      'Revisar fluxo de caixa semanalmente com sócios.',
    ],
    tips: [
      'Uma venda bem registrada evita 90% dos problemas de contrato e financeiro.',
      'Treine corretores para sempre vender pelo mapa.',
      'Faça backup de PDFs assinados fora do sistema se sua política exigir.',
    ],
    keywords: ['dicas', 'boas práticas', 'checklist'],
  },
];

export const MANUAL_FAQ: ManualFaqItem[] = [
  {
    id: 'faq-vender-lote',
    question: 'Como vender um lote?',
    answer:
      'Abra o Mapa GIS, selecione o loteamento, clique em um lote verde (disponível) e escolha Vender. Siga o assistente: cliente, corretor, valores, parcelas e confirme.',
    keywords: ['venda', 'lote', 'mapa'],
  },
  {
    id: 'faq-corrigir-cliente',
    question: 'Como corrigir dados do cliente?',
    answer:
      'Vá em Clientes, localize o comprador, edite os campos necessários e salve. Se o contrato já foi gerado, regenere-o em Contratos após a correção.',
    keywords: ['cliente', 'editar', 'corrigir'],
  },
  {
    id: 'faq-regenerar',
    question: 'Como regenerar contrato?',
    answer:
      'Em Contratos, selecione o contrato e clique em Regenerar contrato. Use após alterar venda, parcelas ou dados do cliente. Baixe o novo PDF em seguida.',
    keywords: ['regenerar', 'contrato'],
  },
  {
    id: 'faq-pagamento',
    question: 'Como registrar pagamento?',
    answer:
      'Em Financeiro, encontre a parcela (filtros por cliente ou lote), clique em Registrar pagamento, informe data, valor e forma de pagamento, e confirme.',
    keywords: ['pagamento', 'parcela', 'financeiro'],
  },
  {
    id: 'faq-vencidas',
    question: 'Como saber quais parcelas estão vencidas?',
    answer:
      'No Financeiro, filtre por status Vencida ou use os indicadores de inadimplência no Dashboard. Parcelas vencidas aparecem em destaque na lista.',
    keywords: ['vencidas', 'inadimplência', 'parcelas'],
  },
  {
    id: 'faq-fluxo',
    question: 'Onde vejo o fluxo de caixa?',
    answer:
      'Acesse Financeiro → Fluxo de Caixa. Lá você vê entradas automáticas dos recebimentos, saídas manuais e o saldo do período.',
    keywords: ['fluxo de caixa', 'saldo'],
  },
  {
    id: 'faq-baixar-contrato',
    question: 'Como baixar contrato?',
    answer:
      'Em Contratos, selecione o contrato e clique em Baixar PDF ou Gerar PDF. Após assinatura completa, use Baixar PDF Assinado.',
    keywords: ['baixar', 'contrato', 'pdf'],
  },
  {
    id: 'faq-assinatura',
    question: 'Como enviar para assinatura?',
    answer:
      'Em Contratos, com contrato ativo, clique em Enviar para assinatura. Compartilhe o link por WhatsApp ou e-mail. O comprador assina primeiro; depois o vendedor assina no sistema.',
    keywords: ['assinatura', 'enviar', 'link'],
  },
  {
    id: 'faq-corretor',
    question: 'Como cadastrar corretor?',
    answer:
      'Menu Corretores → Novo corretor. Preencha nome, contato, CRECI se aplicável e comissão. Ative o corretor para aparecer nas vendas.',
    keywords: ['corretor', 'cadastrar'],
  },
  {
    id: 'faq-logo',
    question: 'Como alterar logo da empresa?',
    answer:
      'Configurações → Dados da empresa → envie a nova logo. Regenere contratos se precisar que o PDF já emitido mostre a marca atualizada.',
    keywords: ['logo', 'empresa', 'configurações'],
  },
];

function sectionHaystack(section: ManualSection): string {
  return [
    section.title,
    section.subtitle,
    section.summary,
    section.whereToFind,
    section.purpose,
    ...section.steps,
    ...section.tips,
    ...(section.keywords || []),
    ...section.badges.map((b) => MANUAL_BADGE_LABELS[b]),
  ]
    .join(' ')
    .toLowerCase();
}

function faqHaystack(item: ManualFaqItem): string {
  return [item.question, item.answer, ...(item.keywords || [])].join(' ').toLowerCase();
}

export type ManualSearchResult = {
  sections: ManualSection[];
  faq: ManualFaqItem[];
  showTrainingBlocks: boolean;
};

export function shouldShowTrainingInSearch(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = trainingHaystack();
  const trainingKeywords = [
    'primeiros passos',
    'fluxograma',
    'fluxo de venda',
    'fluxo de recebimento',
    'cancelamento',
    'regeneração',
    'regenerar',
    'erros comuns',
    'treinamento',
    'onboarding',
    'tempo médio',
    'vídeo',
  ];
  return haystack.includes(q) || trainingKeywords.some((k) => q.includes(k) || k.includes(q));
}

export function filterManualContent(query: string): ManualSearchResult {
  const q = query.trim().toLowerCase();
  const showTrainingBlocks = shouldShowTrainingInSearch(query);

  if (!q) {
    return { sections: MANUAL_SECTIONS, faq: MANUAL_FAQ, showTrainingBlocks: true };
  }

  const sections = MANUAL_SECTIONS.filter((section) => sectionHaystack(section).includes(q)).map(
    (section) => {
      const stepMatches = section.steps.filter((s) => s.toLowerCase().includes(q));
      const tipMatches = section.tips.filter((s) => s.toLowerCase().includes(q));
      if (
        section.title.toLowerCase().includes(q) ||
        section.subtitle.toLowerCase().includes(q) ||
        section.summary.toLowerCase().includes(q) ||
        (stepMatches.length === 0 && tipMatches.length === 0)
      ) {
        return section;
      }
      return {
        ...section,
        steps: stepMatches.length ? stepMatches : section.steps,
        tips: tipMatches.length ? tipMatches : section.tips,
      };
    },
  );

  const faq = MANUAL_FAQ.filter((item) => faqHaystack(item).includes(q));

  return { sections, faq, showTrainingBlocks };
}

/** @deprecated Use filterManualContent */
export function filterManualSections(query: string): ManualSection[] {
  return filterManualContent(query).sections;
}
