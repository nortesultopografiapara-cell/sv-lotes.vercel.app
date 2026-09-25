'use client';

import { ASSISTANT_ASK_ROUTE, buildAssistantAskClientPayload, type AssistantAskApiResponse } from './apiContract';
import { askAssistant } from './ask';
import { ASSISTANT_LOCAL_FALLBACK_NOTICE, ASSISTANT_MAX_HISTORY_MESSAGES } from './constants';
import { localGroundedProvider } from './model/localGroundedProvider';
import { runAssistantPipeline } from './pipeline';
import type { AssistantAskInput, AssistantAskResult, AssistantChatTurn, AssistantMessage } from './types';

export function historyFromMessages(messages: AssistantMessage[]): AssistantChatTurn[] {
  return messages
    .filter((item) => item.id !== 'greeting' && (item.role === 'user' || item.role === 'assistant'))
    .slice(-ASSISTANT_MAX_HISTORY_MESSAGES)
    .map((item) => ({ role: item.role, text: item.text }));
}

export async function requestAssistantAsk(input: AssistantAskInput): Promise<AssistantAskResult> {
  const payload = buildAssistantAskClientPayload({
    question: input.question,
    pathname: input.context.pathname,
    projectName: input.context.projectName,
    contractModel: input.context.contractModel,
    procedureId: input.procedureId,
    impersonatingTenant: input.context.impersonatingTenant,
    flags: input.context.flags,
    history: input.history || [],
    ui: {
      projectId: input.context.ui?.projectId,
      lotId: input.context.ui?.lotId,
      contractId: input.context.ui?.contractId,
      lotModalOpen: input.context.ui?.lotModalOpen,
      activeLotTab: input.context.ui?.activeLotTab,
      saleFormOpen: input.context.ui?.saleFormOpen,
      paymentMode: input.context.ui?.paymentMode,
      customerSelected: input.context.ui?.customerSelected,
      blockNumber: input.context.ui?.blockNumber,
      lotNumber: input.context.ui?.lotNumber,
      lotStatus: input.context.ui?.lotStatus,
      installmentsFilled: input.context.ui?.installmentsFilled,
      firstDueFilled: input.context.ui?.firstDueFilled,
      brokerSelected: input.context.ui?.brokerSelected,
      downPaymentFilled: input.context.ui?.downPaymentFilled,
    },
  });

  try {
    const response = await fetch(ASSISTANT_ASK_ROUTE, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.status === 429) {
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      return {
        kind: 'unknown',
        text: json.error || 'Limite de perguntas do Assistente SV atingido. Tente novamente em alguns minutos.',
        procedureIds: [],
        retrievedTitles: [],
        source: 'local',
        notice: null,
      };
    }

    if (!response.ok) {
      throw new Error(`assistant_http_${response.status}`);
    }

    const json = (await response.json()) as AssistantAskApiResponse;
    return {
      kind: json.kind,
      text: json.text,
      procedureIds: json.procedureIds || [],
      retrievedTitles: [],
      source: json.source,
      notice: json.notice || null,
    };
  } catch {
    try {
      return await runAssistantPipeline(input, {
        primary: localGroundedProvider,
        fallback: localGroundedProvider,
      });
    } catch {
      const composed = askAssistant(input);
      return {
        ...composed,
        source: 'local-fallback',
        notice: ASSISTANT_LOCAL_FALLBACK_NOTICE,
      };
    }
  }
}
