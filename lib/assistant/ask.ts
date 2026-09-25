/**
 * Orquestrador local do Assistente SV (Fase 1A).
 * Mantido para atalhos, testes da 1A e fallback de compose.
 * A conversa da Fase 1B passa por `POST /api/assistant/ask` + `runAssistantPipeline`.
 */
import { ASSISTANT_UNKNOWN_ANSWER } from './constants';
import { composeAssistantAnswer } from './compose';
import { retrieveAssistantProcedures } from './retrieve';
import { looksLikeSecretQuestion, sanitizeAssistantQuestion } from './sanitize';
import type { AssistantAskInput, AssistantAskResult } from './types';

export function askAssistant(input: AssistantAskInput): AssistantAskResult {
  const question = sanitizeAssistantQuestion(input.question);
  if (!question || looksLikeSecretQuestion(question)) {
    return {
      kind: 'unknown',
      text: ASSISTANT_UNKNOWN_ANSWER,
      procedureIds: [],
      retrievedTitles: [],
    };
  }

  const retrieved = retrieveAssistantProcedures({
    question,
    context: input.context,
    procedureId: input.procedureId,
  });

  return composeAssistantAnswer({
    kind: retrieved.kind,
    procedures: retrieved.procedures,
    context: input.context,
    forbiddenReason: retrieved.forbiddenReason,
  });
}
