/**
 * Conteúdo de treinamento e onboarding do manual SV LOTES.
 */

export type ManualIllustrationKey =
  | 'dashboard'
  | 'mapa'
  | 'venda'
  | 'financeiro'
  | 'fluxo-caixa'
  | 'contratos';

export type ManualFirstStep = {
  order: number;
  title: string;
  description: string;
  linkSectionId?: string;
  optional?: boolean;
  estimatedTime?: string;
};

export type ManualFlowchartNode = {
  id: string;
  label: string;
  linkSectionId?: string;
};

export type ManualCompleteFlow = {
  id: string;
  title: string;
  subtitle: string;
  color: 'orange' | 'emerald' | 'red' | 'sky';
  steps: string[];
  estimatedTime: string;
};

export type ManualCommonError = {
  id: string;
  title: string;
  symptom: string;
  solution: string;
};

export const MANUAL_FIRST_STEPS: ManualFirstStep[] = [
  {
    order: 1,
    title: 'Configurar empresa',
    description: 'Preencha razão social, CNPJ, logo, responsável legal e contatos em Configurações.',
    linkSectionId: 'configuracoes',
    estimatedTime: '10 min',
  },
  {
    order: 2,
    title: 'Cadastrar empreendimento',
    description: 'Crie o projeto/loteamento com nome, localização e dados básicos antes de importar lotes.',
    linkSectionId: 'mapa',
    estimatedTime: '5 min',
  },
  {
    order: 3,
    title: 'Importar loteamento',
    description: 'Importe quadras e lotes via KML, TXT ou Shapefile pelo Mapa GIS.',
    linkSectionId: 'mapa',
    estimatedTime: '15–30 min',
  },
  {
    order: 4,
    title: 'Conferir mapa GIS',
    description: 'Valide cores, quadras, números de lotes e confrontações no mapa.',
    linkSectionId: 'mapa',
    estimatedTime: '10 min',
  },
  {
    order: 5,
    title: 'Cadastrar corretores',
    description: 'Registre a equipe comercial com CRECI, comissão e contato.',
    linkSectionId: 'corretores',
    estimatedTime: '3 min / corretor',
  },
  {
    order: 6,
    title: 'Cadastrar proprietários',
    description: 'Opcional: vincule sócios com acesso somente leitura aos projetos.',
    linkSectionId: 'socios-proprietarios',
    optional: true,
    estimatedTime: '5 min',
  },
  {
    order: 7,
    title: 'Fazer primeira venda',
    description: 'Clique em lote verde no mapa e conclua o assistente de venda.',
    linkSectionId: 'venda',
    estimatedTime: '5 min',
  },
  {
    order: 8,
    title: 'Gerar contrato',
    description: 'Ative e gere o PDF do contrato em Contratos.',
    linkSectionId: 'contratos',
    estimatedTime: '30 s',
  },
  {
    order: 9,
    title: 'Enviar assinatura',
    description: 'Compartilhe o link com o comprador e conclua assinatura do vendedor.',
    linkSectionId: 'contratos',
    estimatedTime: '2 min',
  },
  {
    order: 10,
    title: 'Receber pagamento',
    description: 'Registre o recebimento da parcela no Financeiro.',
    linkSectionId: 'financeiro',
    estimatedTime: '1 min',
  },
];

export const MANUAL_MAIN_FLOWCHART: ManualFlowchartNode[] = [
  { id: 'projeto', label: 'Projeto', linkSectionId: 'mapa' },
  { id: 'mapa', label: 'Mapa GIS', linkSectionId: 'mapa' },
  { id: 'lote', label: 'Selecionar lote', linkSectionId: 'venda' },
  { id: 'venda', label: 'Venda', linkSectionId: 'venda' },
  { id: 'cliente', label: 'Cliente', linkSectionId: 'clientes' },
  { id: 'parcelas', label: 'Parcelas', linkSectionId: 'financeiro' },
  { id: 'contrato', label: 'Contrato', linkSectionId: 'contratos' },
  { id: 'assinatura', label: 'Assinatura', linkSectionId: 'contratos' },
  { id: 'financeiro', label: 'Financeiro', linkSectionId: 'financeiro' },
  { id: 'fluxo', label: 'Fluxo de Caixa', linkSectionId: 'fluxo-caixa' },
  { id: 'relatorios', label: 'Relatórios', linkSectionId: 'dashboard' },
];

export const MANUAL_COMPLETE_FLOWS: ManualCompleteFlow[] = [
  {
    id: 'fluxo-venda',
    title: 'Fluxo de Venda',
    subtitle: 'Do lote disponível ao contrato gerado',
    color: 'orange',
    estimatedTime: '~5 min',
    steps: [
      'Abrir Mapa GIS e selecionar o loteamento.',
      'Clicar em lote verde (disponível).',
      'Escolher Vender e selecionar ou cadastrar cliente.',
      'Informar corretor, valor, entrada e parcelas.',
      'Conferir resumo financeiro e confirmar.',
      'Sistema gera venda, parcelas e contrato automaticamente.',
    ],
  },
  {
    id: 'fluxo-recebimento',
    title: 'Fluxo de Recebimento',
    subtitle: 'Registrar pagamento e emitir recibo',
    color: 'emerald',
    estimatedTime: '~1 min',
    steps: [
      'Abrir Financeiro e localizar a parcela (filtro por cliente ou lote).',
      'Clicar em Registrar pagamento.',
      'Informar data, valor recebido e forma de pagamento.',
      'Confirmar — parcela muda para paga.',
      'Gerar recibo PDF para o comprador.',
      'Entrada registrada automaticamente no Fluxo de Caixa.',
    ],
  },
  {
    id: 'fluxo-cancelamento',
    title: 'Fluxo de Cancelamento',
    subtitle: 'Cancelar contrato ou liberar lote reservado',
    color: 'red',
    estimatedTime: '~2 min',
    steps: [
      'Identificar se é reserva (mapa amarelo) ou contrato ativo.',
      'Reserva: cancelar no painel do lote ou aguardar expiração.',
      'Contrato: abrir Contratos → selecionar contrato → Cancelar.',
      'Confirmar ação — status muda para cancelado.',
      'Lote volta a disponível no mapa (verde) quando aplicável.',
      'Revise parcelas e financeiro após cancelamento.',
    ],
  },
  {
    id: 'fluxo-regeneracao',
    title: 'Fluxo de Regeneração do Contrato',
    subtitle: 'Atualizar PDF após mudanças na venda',
    color: 'sky',
    estimatedTime: '~30 s',
    steps: [
      'Corrigir dados do cliente, venda ou parcelas (se necessário).',
      'Abrir Contratos e localizar o contrato.',
      'Clicar em Regenerar contrato.',
      'Aguardar processamento do novo PDF.',
      'Baixar PDF atualizado.',
      'Reenviar para assinatura se o comprador ainda não assinou a versão antiga.',
    ],
  },
];

export const MANUAL_COMMON_ERRORS: ManualCommonError[] = [
  {
    id: 'err-email',
    title: 'Cliente sem e-mail',
    symptom: 'Não é possível enviar contrato para assinatura eletrônica.',
    solution:
      'Edite o cliente em Clientes, adicione e-mail válido, salve e regenere o contrato se necessário. Só então envie para assinatura.',
  },
  {
    id: 'err-contrato',
    title: 'Contrato não atualizado',
    symptom: 'PDF mostra dados antigos (valor, parcelas ou comprador).',
    solution:
      'Em Contratos, use Regenerar contrato após qualquer alteração na venda ou no cadastro do cliente. Baixe o PDF novo.',
  },
  {
    id: 'err-parcelas',
    title: 'Parcelas incorretas',
    symptom: 'Valores ou quantidade de parcelas divergem do acordado.',
    solution:
      'Corrija a venda ou parcelas na origem, regenere o contrato e confira o Financeiro. Se já houve pagamento, ajuste com cuidado e registre no suporte interno.',
  },
  {
    id: 'err-reserva',
    title: 'Lote reservado',
    symptom: 'Lote amarelo no mapa — outro corretor não consegue vender.',
    solution:
      'Conclua a venda da reserva ou cancele/libere a reserva no painel do lote para voltar ao status disponível (verde).',
  },
  {
    id: 'err-cancelado',
    title: 'Contrato cancelado',
    symptom: 'Ações bloqueadas — carnê, assinatura ou pagamento indisponíveis.',
    solution:
      'Contrato cancelado não deve receber pagamentos. Se foi erro, avalie nova venda ou contate o administrador. Não reutilize contrato cancelado.',
  },
];

/** Tempo médio por operação (referência de treinamento). */
export const MANUAL_OPERATION_TIMES: Array<{ label: string; time: string }> = [
  { label: 'Cadastrar cliente', time: '2 min' },
  { label: 'Cadastrar corretor', time: '3 min' },
  { label: 'Importar loteamento', time: '15–30 min' },
  { label: 'Venda de lote', time: '5 min' },
  { label: 'Gerar contrato', time: '30 s' },
  { label: 'Enviar assinatura', time: '2 min' },
  { label: 'Registrar pagamento', time: '1 min' },
  { label: 'Gerar recibo', time: '30 s' },
  { label: 'Regenerar contrato', time: '30 s' },
];

export const MANUAL_ILLUSTRATION_META: Record<
  ManualIllustrationKey,
  { title: string; caption: string }
> = {
  dashboard: {
    title: 'Dashboard',
    caption: 'Indicadores de lotes, VGV e inadimplência do empreendimento.',
  },
  mapa: {
    title: 'Mapa GIS',
    caption: 'Lotes coloridos por status — operação principal do sistema.',
  },
  venda: {
    title: 'Venda de lote',
    caption: 'Assistente de venda iniciado pelo clique no lote.',
  },
  financeiro: {
    title: 'Financeiro',
    caption: 'Lista de parcelas, filtros e registro de pagamentos.',
  },
  'fluxo-caixa': {
    title: 'Fluxo de Caixa',
    caption: 'Entradas, saídas e saldo consolidado do período.',
  },
  contratos: {
    title: 'Contratos',
    caption: 'Status, PDF, assinatura eletrônica e carnê.',
  },
};

/** Dicas de treinamento SV LOTES — exibidas ao final de cada módulo. */
export const MANUAL_TRAINING_TIPS_BY_SECTION: Record<string, string[]> = {
  intro: [
    'Use o Mapa GIS como ponto central da operação diária.',
    'Siga a sequência Primeiros Passos antes da primeira venda real.',
  ],
  'primeiro-acesso': [
    'Confirme empresa e projeto corretos antes de qualquer venda.',
    'Corretores devem treinar primeiro no mapa em modo demonstração, se disponível.',
  ],
  dashboard: [
    'Abra o Dashboard toda manhã para ver inadimplência e lotes disponíveis.',
    'Use o seletor de projeto quando gerenciar mais de um loteamento.',
  ],
  mapa: [
    'Sempre vender pelo mapa — nunca registre venda “por fora”.',
    'Confira confrontações antes de gerar memorial ou contrato.',
    'Verde = disponível, amarelo = reservado, vermelho = vendido.',
  ],
  clientes: [
    'Sempre conferir e-mail antes de enviar assinatura.',
    'CPF/CNPJ correto evita retrabalho no contrato.',
  ],
  corretores: [
    'Vincule o corretor certo em cada venda para comissões corretas.',
    'Desative corretores inativos em vez de apagar histórico.',
  ],
  venda: [
    'Sempre revisar parcelas antes de confirmar a venda.',
    'Entrada e desconto impactam carnê e fluxo de caixa.',
    'Reserva amarela protege o lote temporariamente.',
  ],
  contratos: [
    'Sempre regenerar contrato após alterações na venda ou no cliente.',
    'Comprador assina primeiro; vendedor assina depois no sistema.',
    'Confira e-mail do comprador antes de enviar link.',
  ],
  financeiro: [
    'Registre pagamentos no mesmo dia do recebimento.',
    'Gere recibo após cada confirmação de pagamento.',
    'Filtre por lote para atender o comprador rapidamente.',
  ],
  'fluxo-caixa': [
    'Lance despesas manualmente para saldo realista.',
    'Compare com inadimplência do Dashboard semanalmente.',
  ],
  'minha-assinatura': [
    'Mantenha cobrança SaaS em dia para evitar suspensão do sistema.',
  ],
  'socios-proprietarios': [
    'Proprietários veem resultados, mas não alteram vendas.',
  ],
  'sincronizacao-offline': [
    'Sincronize na base com Wi-Fi antes e depois de ir a campo.',
  ],
  configuracoes: [
    'Dados completos da empresa aparecem em todos os contratos.',
    'Atualize logo antes de regenerar contratos em massa.',
  ],
  'documentos-automaticos': [
    'Memorial e prancha dependem de geometria correta no mapa.',
    'Certificado de assinatura valida em /verify.',
  ],
  dicas: [
    'Uma venda bem feita no mapa evita 90% dos problemas.',
    'Treine a equipe com este manual antes de operar em produção.',
  ],
};

export const MANUAL_SECTION_ESTIMATED_TIME: Record<string, string> = {
  dashboard: '3 min leitura',
  mapa: '10 min prática',
  clientes: '2 min / cadastro',
  corretores: '3 min / cadastro',
  venda: '5 min',
  contratos: '30 s – 2 min',
  financeiro: '1 min / pagamento',
  'fluxo-caixa': '5 min',
  configuracoes: '10 min',
};

export const MANUAL_SECTION_ILLUSTRATION: Partial<Record<string, ManualIllustrationKey>> = {
  dashboard: 'dashboard',
  mapa: 'mapa',
  venda: 'venda',
  financeiro: 'financeiro',
  'fluxo-caixa': 'fluxo-caixa',
  contratos: 'contratos',
};

export function getTrainingTipsForSection(sectionId: string, fallbackTips: string[]): string[] {
  const extra = MANUAL_TRAINING_TIPS_BY_SECTION[sectionId];
  if (!extra?.length) return fallbackTips;
  const merged = [...extra];
  for (const tip of fallbackTips) {
    if (!merged.includes(tip)) merged.push(tip);
  }
  return merged;
}

export function trainingHaystack(): string {
  return [
    ...MANUAL_FIRST_STEPS.map((s) => `${s.title} ${s.description}`),
    ...MANUAL_COMPLETE_FLOWS.flatMap((f) => [f.title, f.subtitle, ...f.steps]),
    ...MANUAL_COMMON_ERRORS.flatMap((e) => [e.title, e.symptom, e.solution]),
    ...MANUAL_OPERATION_TIMES.map((t) => `${t.label} ${t.time}`),
    'primeiros passos',
    'fluxograma',
    'treinamento',
    'erros comuns',
  ]
    .join(' ')
    .toLowerCase();
}
