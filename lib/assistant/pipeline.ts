import {
  ASSISTANT_FORBIDDEN_WHO_ADMIN,
  ASSISTANT_INJECTION_REFUSAL,
  ASSISTANT_LOCAL_FALLBACK_NOTICE,
  ASSISTANT_MAX_OUTPUT_CHARS,
  ASSISTANT_RETRIEVE_LIMIT_CONVERSATIONAL,
  ASSISTANT_UNKNOWN_ANSWER,
} from './constants';
import { composeAssistantAnswer } from './compose';
import { retrieveAssistantProcedures } from './retrieve';
import {
  buildRetrievalQuery,
  looksLikePromptInjection,
  looksLikeSecretQuestion,
  sanitizeAssistantHistory,
  sanitizeAssistantQuestion,
} from './sanitize';
import { composeFromValidatedUi } from './composeFromUi';
import { localGroundedProvider } from './model/localGroundedProvider';
import { isAssistantContractsPath } from './uiSnapshot';
import { resolveAssistantActiveGoal } from './activeGoal';
import type { AssistantModelProvider } from './model/types';
import type { AssistantAskInput, AssistantAskResult } from './types';

export type AssistantPipelineDeps = {
  primary: AssistantModelProvider;
  fallback: AssistantModelProvider;
};

function withWhoCanExecute(result: AssistantAskResult): AssistantAskResult {
  if (result.kind !== 'forbidden') return result;
  if (result.text.includes('Administrador da Empresa')) return result;
  return { ...result, text: `${result.text} ${ASSISTANT_FORBIDDEN_WHO_ADMIN}` };
}

export async function runAssistantPipeline(
  input: AssistantAskInput,
  deps: AssistantPipelineDeps,
): Promise<AssistantAskResult> {
  const question = sanitizeAssistantQuestion(input.question);
  const history = sanitizeAssistantHistory(input.history || []);

  if (!question || looksLikeSecretQuestion(question)) {
    return {
      kind: 'unknown',
      text: ASSISTANT_UNKNOWN_ANSWER,
      procedureIds: [],
      retrievedTitles: [],
      source: 'local',
    };
  }

  const injection = looksLikePromptInjection(question);
  if (injection && !/\b(venda|contrato|assinatura|lote|cobranca|cobrança|financeiro|mapa)\b/i.test(question)) {
    return {
      kind: 'unknown',
      text: ASSISTANT_INJECTION_REFUSAL,
      procedureIds: [],
      retrievedTitles: [],
      source: 'local',
    };
  }

  const activeGoal = resolveAssistantActiveGoal({
    question,
    history,
    context: input.context,
  });

  const retrieved = retrieveAssistantProcedures({
    question: buildRetrievalQuery(question, history),
    context: input.context,
    procedureId: input.procedureId,
    limit: ASSISTANT_RETRIEVE_LIMIT_CONVERSATIONAL,
    activeGoal,
  });

  const composed = composeAssistantAnswer({
    kind: retrieved.kind,
    procedures: retrieved.procedures,
    context: input.context,
    forbiddenReason: retrieved.forbiddenReason,
  });

  const uiGrounded = composeFromValidatedUi({ question, context: input.context, activeGoal });
  if (
    uiGrounded &&
    composed.kind !== 'forbidden' &&
    (input.context.ui.contractId ||
      input.context.ui.saleFormOpen ||
      isAssistantContractsPath(input.context.pathname) ||
      Boolean(activeGoal))
  ) {
    return {
      kind: 'answer',
      text: uiGrounded.slice(0, ASSISTANT_MAX_OUTPUT_CHARS),
      procedureIds: composed.procedureIds,
      retrievedTitles: composed.retrievedTitles,
      source: 'local',
      notice: null,
    };
  }

  if (composed.kind !== 'answer') {
    return { ...withWhoCanExecute(composed), source: 'local' };
  }

  const generateInput = {
    messages: [{ role: 'user' as const, content: question }],
    knowledge: retrieved.procedures,
    context: input.context,
    history,
    activeGoal,
    policy: { canAnswer: true as const, reason: 'ok' as const },
  };

  try {
    const generated = await deps.primary.generate(generateInput);
    const text = sanitizeAssistantQuestion(String(generated.text || '').trim(), ASSISTANT_MAX_OUTPUT_CHARS);
    if (!text) throw new Error('empty');
    const isLocal = generated.providerId === localGroundedProvider.id;
    return {
      kind: 'answer',
      text,
      procedureIds: composed.procedureIds,
      retrievedTitles: composed.retrievedTitles,
      source: isLocal ? 'local' : 'model',
      notice: isLocal ? ASSISTANT_LOCAL_FALLBACK_NOTICE : null,
    };
  } catch {
    try {
      const generated = await deps.fallback.generate(generateInput);
      const text =
        sanitizeAssistantQuestion(String(generated.text || '').trim(), ASSISTANT_MAX_OUTPUT_CHARS) || composed.text;
      return {
        kind: 'answer',
        text,
        procedureIds: composed.procedureIds,
        retrievedTitles: composed.retrievedTitles,
        source: 'local-fallback',
        notice: ASSISTANT_LOCAL_FALLBACK_NOTICE,
      };
    } catch {
      return {
        ...composed,
        source: 'local-fallback',
        notice: ASSISTANT_LOCAL_FALLBACK_NOTICE,
      };
    }
  }
}
