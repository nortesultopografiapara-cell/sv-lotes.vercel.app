import {
  ASSISTANT_CAPABILITY_LIMIT,
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
import { composeFromValidatedUi, isAssistantNowQuestion } from './composeFromUi';
import { localGroundedProvider } from './model/localGroundedProvider';
import { isAssistantContractsPath } from './uiSnapshot';
import { resolveAssistantActiveGoal } from './activeGoal';
import { retrieveAssistantCapabilities } from './capabilities/retrieve';
import { packedCapabilityChars } from './capabilities/pack';
import { logAssistantKnowledgeGap } from './capabilities/gap';
import { executeAssistantReadonlyTool } from './readonly/execute';
import { formatReadonlyFacts, formatReadonlyFailure, readonlyFactsRespected } from './readonly/format';
import { resolveAssistantReadonlyIntent } from './readonly/intent';
import { logAssistantReadonlyTool } from './readonly/log';
import { packedReadonlyHasNoSecrets, packReadonlyFacts } from './readonly/sanitize';
import type { AssistantReadonlyRuntime } from './readonly/types';
import type { AssistantModelProvider } from './model/types';
import type { AssistantAskInput, AssistantAskResult } from './types';

export type AssistantPipelineDeps = {
  primary: AssistantModelProvider;
  fallback: AssistantModelProvider;
  readonly?: AssistantReadonlyRuntime;
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

  if (!question) {
    logAssistantKnowledgeGap({
      intent: '',
      module: input.context.moduleId,
      route: input.context.pathname,
      considered: [],
      reason: 'empty_question',
    });
    return {
      kind: 'unknown',
      text: ASSISTANT_UNKNOWN_ANSWER,
      procedureIds: [],
      retrievedTitles: [],
      capabilityIds: [],
      source: 'local',
    };
  }

  if (looksLikeSecretQuestion(question)) {
    return {
      kind: 'unknown',
      text: ASSISTANT_UNKNOWN_ANSWER,
      procedureIds: [],
      retrievedTitles: [],
      capabilityIds: [],
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
      capabilityIds: [],
      source: 'local',
    };
  }

  const activeGoal = resolveAssistantActiveGoal({
    question,
    history,
    context: input.context,
  });

  if (deps.readonly) {
    const intent = resolveAssistantReadonlyIntent({
      question,
      history,
      context: input.context,
    });
    if (intent) {
      const started = Date.now();
      const execution = await executeAssistantReadonlyTool({
        toolId: intent.toolId,
        args: intent.args,
        runtime: { ...deps.readonly, role: deps.readonly.role || input.context.role },
      });
      logAssistantReadonlyTool({
        toolId: intent.toolId,
        tenantId: deps.readonly.tenantId,
        userId: deps.readonly.userId,
        durationMs: Date.now() - started,
        ok: execution.ok,
        rowCount: execution.ok ? execution.rowCount : 0,
      });
      if (!execution.ok) {
        const forbidden = execution.reason === 'forbidden';
        return {
          kind: forbidden ? 'forbidden' : 'answer',
          text: formatReadonlyFailure(execution),
          procedureIds: [],
          retrievedTitles: [],
          capabilityIds: [],
          source: 'readonly',
          toolId: intent.toolId,
          toolOk: false,
        };
      }
      const formatted = formatReadonlyFacts(execution.facts);
      const packed = packReadonlyFacts(execution.facts);
      const packedOk = packedReadonlyHasNoSecrets(packed);
      const generateInput = {
        messages: [{ role: 'user' as const, content: question }],
        knowledge: [],
        context: input.context,
        history,
        activeGoal,
        readonlyFacts: packedOk ? packed : null,
        policy: { canAnswer: true as const, reason: 'ok' as const },
      };
      if (packedOk) {
        try {
          const generated = await deps.primary.generate(generateInput);
          const text = sanitizeAssistantQuestion(String(generated.text || '').trim(), ASSISTANT_MAX_OUTPUT_CHARS);
          if (text && readonlyFactsRespected(text, execution.facts)) {
            const isLocal = generated.providerId === localGroundedProvider.id;
            return {
              kind: 'answer',
              text,
              procedureIds: [],
              retrievedTitles: [],
              capabilityIds: [],
              packedChars: packed.length,
              source: isLocal ? 'readonly' : 'model',
              toolId: intent.toolId,
              toolOk: true,
              notice: null,
            };
          }
        } catch {
          try {
            const generated = await deps.fallback.generate(generateInput);
            const text = sanitizeAssistantQuestion(String(generated.text || '').trim(), ASSISTANT_MAX_OUTPUT_CHARS);
            if (text && readonlyFactsRespected(text, execution.facts)) {
              return {
                kind: 'answer',
                text,
                procedureIds: [],
                retrievedTitles: [],
                capabilityIds: [],
                packedChars: packed.length,
                source: 'readonly',
                toolId: intent.toolId,
                toolOk: true,
                notice: ASSISTANT_LOCAL_FALLBACK_NOTICE,
              };
            }
          } catch {
            /* formatter local */
          }
        }
      }
      return {
        kind: 'answer',
        text: formatted,
        procedureIds: [],
        retrievedTitles: [],
        capabilityIds: [],
        packedChars: packed.length,
        source: 'readonly',
        toolId: intent.toolId,
        toolOk: true,
        notice: null,
      };
    }
  }

  const query = buildRetrievalQuery(question, history);
  const retrieveBoth = (relax: boolean) => ({
    caps: retrieveAssistantCapabilities({
      question: query,
      context: input.context,
      activeGoal,
      limit: ASSISTANT_CAPABILITY_LIMIT,
      relax,
    }),
    retrieved: retrieveAssistantProcedures({
      question: query,
      context: input.context,
      procedureId: input.procedureId,
      limit: ASSISTANT_RETRIEVE_LIMIT_CONVERSATIONAL,
      activeGoal,
      relax,
    }),
  });

  let { caps, retrieved } = retrieveBoth(false);

  if (retrieved.kind === 'forbidden' || caps.kind === 'forbidden') {
    const forbidden = retrieved.kind === 'forbidden' ? retrieved : caps;
    const composedForbidden = composeAssistantAnswer({
      kind: 'forbidden',
      procedures: [],
      context: input.context,
      forbiddenReason: forbidden.forbiddenReason,
    });
    return { ...withWhoCanExecute(composedForbidden), capabilityIds: [], source: 'local' };
  }

  if (retrieved.kind !== 'answer' && caps.kind !== 'answer') {
    ({ caps, retrieved } = retrieveBoth(true));
  }

  if (retrieved.kind !== 'answer' && caps.kind !== 'answer') {
    logAssistantKnowledgeGap({
      intent: question,
      module: input.context.moduleId,
      route: input.context.pathname,
      considered: caps.considered || [],
      reason: 'no_match',
    });
    return {
      kind: 'unknown',
      text: ASSISTANT_UNKNOWN_ANSWER,
      procedureIds: [],
      retrievedTitles: [],
      capabilityIds: [],
      source: 'local',
    };
  }

  const composed = composeAssistantAnswer({
    kind: retrieved.kind === 'answer' ? 'answer' : 'unknown',
    procedures: retrieved.procedures,
    context: input.context,
    forbiddenReason: retrieved.forbiddenReason,
  });

  const capabilityIds = caps.capabilities.map((item) => item.id);
  const packedChars = packedCapabilityChars(caps.capabilities);

  const uiGrounded = composeFromValidatedUi({ question, context: input.context, activeGoal });
  const uiSovereign =
    Boolean(input.context.ui.contractId) ||
    Boolean(input.context.ui.saleFormOpen) ||
    isAssistantContractsPath(input.context.pathname) ||
    (Boolean(activeGoal) && isAssistantNowQuestion(question));
  if (uiGrounded && composed.kind !== 'forbidden' && uiSovereign) {
    return {
      kind: 'answer',
      text: uiGrounded.slice(0, ASSISTANT_MAX_OUTPUT_CHARS),
      procedureIds: composed.procedureIds,
      retrievedTitles: composed.retrievedTitles,
      capabilityIds,
      packedChars,
      source: 'local',
      notice: null,
    };
  }

  if (composed.kind !== 'answer' && caps.kind !== 'answer') {
    return { ...withWhoCanExecute(composed), capabilityIds, packedChars, source: 'local' };
  }

  const generateInput = {
    messages: [{ role: 'user' as const, content: question }],
    knowledge: retrieved.procedures,
    capabilities: caps.capabilities,
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
      retrievedTitles: composed.retrievedTitles.length ? composed.retrievedTitles : caps.capabilities.map((item) => item.title),
      capabilityIds,
      packedChars,
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
        capabilityIds,
        packedChars,
        source: 'local-fallback',
        notice: ASSISTANT_LOCAL_FALLBACK_NOTICE,
      };
    } catch {
      return {
        ...composed,
        capabilityIds,
        packedChars,
        source: 'local-fallback',
        notice: ASSISTANT_LOCAL_FALLBACK_NOTICE,
      };
    }
  }
}
