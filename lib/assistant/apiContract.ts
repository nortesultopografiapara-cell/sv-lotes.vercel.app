/**
 * Contrato HTTP do Assistente SV (Fase 1B).
 * O cliente não envia role, tenant, JWT nem secrets.
 */
export const ASSISTANT_ASK_ROUTE = '/api/assistant/ask';

export type AssistantAskApiRequest = {
  question: string;
  pathname?: string;
  projectName?: string | null;
  contractModel?: string | null;
  procedureId?: string;
  impersonatingTenant?: boolean;
  flags?: {
    clientPortal?: boolean;
    bankingUi?: boolean;
  };
  history?: Array<{
    role: 'assistant' | 'user';
    text: string;
  }>;
  ui?: {
    projectId?: string | null;
    lotId?: string | null;
    contractId?: string | null;
    lotModalOpen?: boolean;
    activeLotTab?: string | null;
    saleFormOpen?: boolean;
    paymentMode?: string | null;
    customerSelected?: boolean;
    blockNumber?: string | null;
    lotNumber?: string | null;
    lotStatus?: string | null;
  };
};

export function buildAssistantAskClientPayload(input: AssistantAskApiRequest): AssistantAskApiRequest {
  return {
    question: input.question,
    pathname: input.pathname,
    projectName: input.projectName ?? null,
    contractModel: input.contractModel ?? null,
    procedureId: input.procedureId,
    impersonatingTenant: Boolean(input.impersonatingTenant),
    flags: input.flags,
    history: input.history || [],
    ui: input.ui,
  };
}

export type AssistantAskApiResponse = {
  kind: 'answer' | 'unknown' | 'forbidden';
  text: string;
  procedureIds: string[];
  source: 'model' | 'local' | 'local-fallback';
  notice?: string | null;
};
