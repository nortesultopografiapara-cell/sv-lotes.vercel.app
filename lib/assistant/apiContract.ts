/**
 * Contrato HTTP reservado para a Fase 1B.
 * Não há rota ativa nem provedor LLM nesta fase.
 */
export const ASSISTANT_ASK_ROUTE = '/api/assistant/ask';

export type AssistantAskApiRequest = {
  question: string;
  context: {
    pathname: string;
    projectName?: string | null;
    contractModel?: string | null;
    flags?: {
      clientPortal?: boolean;
      bankingUi?: boolean;
    };
  };
};

export type AssistantAskApiResponse = {
  kind: 'answer' | 'unknown' | 'forbidden';
  text: string;
  procedureIds: string[];
};
