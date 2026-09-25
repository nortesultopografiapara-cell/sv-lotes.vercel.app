import { ASSISTANT_RETRIEVE_LIMIT } from './constants';
import { filterProceduresForRole, canRoleReceiveProcedure } from './policy';
import { listAssistantProcedures } from './knowledgeBase';
import type { AssistantAskKind, AssistantProcedure, AssistantSafeContext } from './types';

export type AssistantRetrieval = {
  kind: Extract<AssistantAskKind, 'answer' | 'unknown' | 'forbidden'>;
  procedures: AssistantProcedure[];
  forbiddenReason?: 'broker' | 'owner-write' | 'profile';
};

const STOPWORDS = new Set([
  'como',
  'faco',
  'faço',
  'fazer',
  'para',
  'uma',
  'um',
  'o',
  'a',
  'os',
  'as',
  'de',
  'do',
  'da',
  'em',
  'no',
  'na',
  'que',
  'qual',
  'quais',
  'meu',
  'minha',
  'por',
  'com',
  'sv',
  'lotes',
  'sistema',
  'uso',
  'usar',
  'quero',
]);

function normalize(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(text: string): string[] {
  return normalize(text)
    .split(/\s+/)
    .filter((item) => item.length > 2 && !STOPWORDS.has(item));
}

function scoreProcedure(
  procedure: AssistantProcedure,
  question: string,
  context: AssistantSafeContext,
): number {
  const haystack = normalize(
    [
      procedure.id,
      procedure.title,
      procedure.module,
      procedure.tags.join(' '),
      procedure.objective,
      procedure.navigationPath.join(' '),
      procedure.steps.join(' '),
      procedure.uiLabels.join(' '),
    ].join(' '),
  );
  const words = tokens(question);
  if (words.length === 0) return 0;

  let score = 0;
  let matched = 0;
  for (const word of words) {
    if (haystack.includes(word)) {
      score += 3;
      matched += 1;
    }
    if (procedure.tags.some((tag) => normalize(tag).includes(word) || word.includes(normalize(tag)))) {
      score += 4;
      matched += 1;
    }
    if (normalize(procedure.title).includes(word)) {
      score += 5;
      matched += 1;
    }
  }
  if (matched === 0) return 0;

  if (procedure.routes.some((route) => context.pathname === route || context.pathname.startsWith(`${route}/`))) {
    score += 6;
  }
  if (procedure.module === context.moduleId) score += 4;

  const model = String(context.contractModel || '').toUpperCase();
  if (model && procedure.contractModels?.includes(model)) score += 10;
  if (model === 'ESTRELA_DO_SUL' && /lf|estrela/.test(normalize(question))) score += 8;
  if (model === 'MUNDO_NOVO' && /mundo novo/.test(normalize(question))) score += 8;
  if (!model && /lf|estrela/.test(normalize(question)) && procedure.id.includes('lf-imoveis')) score += 8;
  if (!model && /mundo novo/.test(normalize(question)) && procedure.id.includes('mundo-novo')) score += 8;

  return score;
}

export function retrieveAssistantProcedures(input: {
  question: string;
  context: AssistantSafeContext;
  procedureId?: string;
  limit?: number;
}): AssistantRetrieval {
  const all = listAssistantProcedures();
  const limit = input.limit ?? ASSISTANT_RETRIEVE_LIMIT;

  if (input.procedureId) {
    const direct = all.find((item) => item.id === input.procedureId);
    if (!direct) return { kind: 'unknown', procedures: [] };
    const decision = canRoleReceiveProcedure(direct, input.context);
    if (!decision.allowed) {
      return {
        kind: 'forbidden',
        procedures: [],
        forbiddenReason: decision.reason === 'ok' ? 'profile' : decision.reason,
      };
    }
    return { kind: 'answer', procedures: [direct] };
  }

  const ranked = all
    .map((procedure) => ({
      procedure,
      score: scoreProcedure(procedure, input.question, input.context),
      decision: canRoleReceiveProcedure(procedure, input.context),
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best || best.score < 8) {
    return { kind: 'unknown', procedures: [] };
  }

  if (!best.decision.allowed) {
    return {
      kind: 'forbidden',
      procedures: [],
      forbiddenReason: best.decision.reason === 'ok' ? 'profile' : best.decision.reason,
    };
  }

  const allowed = filterProceduresForRole(
    ranked.filter((item) => item.score >= 8).map((item) => item.procedure),
    input.context,
  );

  return {
    kind: 'answer',
    procedures: allowed.slice(0, limit),
  };
}
