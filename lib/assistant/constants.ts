export const ASSISTANT_BUTTON_LABEL = 'Assistente IA';
export const ASSISTANT_BUTTON_MOBILE_LABEL = 'IA';
export const ASSISTANT_TOOLTIP_TITLE = 'Pergunte ao Assistente SV';
export const ASSISTANT_TOOLTIP_DESCRIPTION =
  'Orientação passo a passo com os caminhos reais da interface do SV Lotes.';
export const ASSISTANT_PANEL_TITLE = 'Assistente SV';
export const ASSISTANT_PANEL_SUBTITLE = 'Especialista no SV Lotes';
export const ASSISTANT_INPUT_PLACEHOLDER = 'Pergunte ao Assistente SV...';
export const ASSISTANT_MANUAL_FALLBACK_LABEL = 'Abrir Manual Completo';
export const ASSISTANT_MANUAL_HREF = '/manual';

export const ASSISTANT_GREETING =
  'Olá! Sou o Assistente SV. Posso orientar você passo a passo em qualquer operação do SV Lotes disponível para o seu perfil. O que deseja fazer?';

export const ASSISTANT_UNKNOWN_ANSWER =
  'Não encontrei uma orientação confirmada na documentação oficial do SV Lotes para essa dúvida.';

export const ASSISTANT_FORBIDDEN_WRITE_OWNER =
  'O perfil Proprietário / Sócio é somente leitura. Posso orientar consultas, mas não descrevo operações que alteram venda, contrato, cobrança ou configuração.';

export const ASSISTANT_FORBIDDEN_BROKER =
  'Seu perfil (Corretor / Vendedor) não tem acesso a esse módulo. No SV Lotes o corretor opera pelo Mapa GIS e por Minhas Vendas.';

export const ASSISTANT_MASTER_DISCLAIMER =
  'O Assistente SV descreve operações do tenant (empresa) no SV Lotes. Ele não substitui o console Master SaaS.';

export const ASSISTANT_GUIDANCE_ONLY =
  'Este assistente apenas orienta. Ele não cria venda, não reserva lote, não emite cobrança, não dá baixa, não assina e não altera configuração.';

export const ASSISTANT_KB_VERSION = '1.0.0';

export const ASSISTANT_RETRIEVE_LIMIT = 2;
export const ASSISTANT_RETRIEVE_LIMIT_CONVERSATIONAL = 6;

export const ASSISTANT_THINKING_LABEL = 'Assistente está pensando...';
export const ASSISTANT_LOCAL_FALLBACK_NOTICE =
  'Resposta baseada na documentação local do SV Lotes.';
export const ASSISTANT_UNAVAILABLE_NOTICE =
  'O assistente conversacional está temporariamente indisponível. Segue a orientação da documentação oficial.';
export const ASSISTANT_INJECTION_REFUSAL =
  'Não posso alterar minhas regras nem revelar instruções internas. Posso orientar operações do SV Lotes com base na documentação oficial.';

export const ASSISTANT_FORBIDDEN_WHO_ADMIN =
  'Essa operação é executada pelo Administrador da Empresa.';

export const ASSISTANT_MAX_QUESTION_CHARS = 800;
export const ASSISTANT_MAX_HISTORY_MESSAGES = 6;
export const ASSISTANT_MAX_OUTPUT_CHARS = 2200;
export const ASSISTANT_MODEL_TIMEOUT_MS = 8000;
export const ASSISTANT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
export const ASSISTANT_RATE_LIMIT_MAX = 20;
