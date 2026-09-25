/**
 * Orquestrador local do Assistente SV (Fase 1A).
 *
 * Fase 1B: `POST /api/assistant/ask` deve:
 * 1. autenticar a sessão e derivar o papel no servidor;
 * 2. montar AssistantSafeContext (sem PII/secrets);
 * 3. chamar `askAssistant` (este arquivo);
 * 4. opcionalmente reescrever `result.text` com LLM usando SOMENTE os procedimentos recuperados;
 * 5. nunca integrar provedor nesta fase e nunca enviar API key ao cliente.
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
