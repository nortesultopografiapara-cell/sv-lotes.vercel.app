import { ASSISTANT_RETRIEVE_LIMIT } from './constants';
import { filterProceduresForRole, canRoleReceiveProcedure } from './policy';
import { listAssistantProcedures } from './knowledgeBase';
import type { AssistantActiveGoal } from './activeGoal';
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

function pluralish(a: string, b: string): boolean {
  return a === `${b}s` || b === `${a}s` || a === `${b}es` || b === `${a}es`;
}

function verbish(tagToken: string, word: string): boolean {
  if (tagToken.length < 6 && word.length < 6) return false;
  if (tagToken.endsWith('ar') && word.endsWith('o') && tagToken.slice(0, -2) === word.slice(0, -1)) return true;
  if (word.endsWith('ar') && tagToken.endsWith('o') && word.slice(0, -2) === tagToken.slice(0, -1)) return true;
  return false;
}

function tagMatchesWord(tag: string, word: string): boolean {
  const t = normalize(tag);
  if (!t || !word) return false;
  if (t === word || pluralish(t, word) || verbish(t, word)) return true;
  return t.split(/\s+/).some((part) => part === word || pluralish(part, word) || verbish(part, word));
}

const MODULE_HINTS: Record<string, string[]> = {
  finance: ['financeiro', 'recibo', 'inadimplencia'],
  charges: ['cobranca'],
  brokers: ['corretor', 'creci'],
  customers: ['cliente'],
  contracts: ['contrato'],
  dashboard: ['dashboard'],
  split: ['split', 'rateio'],
};

function scoreProcedure(
  procedure: AssistantProcedure,
  question: string,
  context: AssistantSafeContext,
  activeGoal?: AssistantActiveGoal | null,
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
  if (words.length === 0) {
    if (activeGoal?.procedureId === procedure.id) return 22;
    return 0;
  }

  let score = 0;
  let matched = 0;
  for (const word of words) {
    if (haystack.includes(word)) {
      score += 3;
      matched += 1;
    }
    if (procedure.tags.some((tag) => tagMatchesWord(tag, word))) {
      score += 4;
      matched += 1;
    }
    if (normalize(procedure.title).includes(word)) {
      score += 5;
      matched += 1;
    }
  }
  if (activeGoal?.procedureId === procedure.id) score += 24;
  if (activeGoal && procedure.tags.includes(activeGoal.id)) score += 16;

  const qn = normalize(question);
  for (const tag of procedure.tags) {
    const t = normalize(tag);
    const specific = t.includes(' ') || t.includes('.') || t.length >= 12;
    if (specific && qn.includes(t)) score += 10;
  }

  const hints = MODULE_HINTS[procedure.module] || [];
  if (hints.some((hint) => words.some((word) => word === hint || pluralish(word, hint)))) {
    score += 12;
  }

  if (matched === 0 && activeGoal?.procedureId !== procedure.id) {
    if (
      (context.ui?.lotModalOpen || context.ui?.saleFormOpen) &&
      procedure.module === 'gis' &&
      (!activeGoal || activeGoal.module !== 'gis' || activeGoal.procedureId === procedure.id)
    ) {
      return 12;
    }
    return 0;
  }

  if (procedure.routes.some((route) => context.pathname === route || context.pathname.startsWith(`${route}/`))) {
    score += 6;
  }
  if (procedure.module === context.moduleId) score += 4;
  if ((context.ui?.lotModalOpen || context.ui?.saleFormOpen) && procedure.module === 'gis') score += 8;
  if (context.ui?.contractId && procedure.module === 'contracts') score += 8;

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
  activeGoal?: AssistantActiveGoal | null;
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
      score: scoreProcedure(procedure, input.question, input.context, input.activeGoal),
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
