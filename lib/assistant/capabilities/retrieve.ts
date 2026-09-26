import { ASSISTANT_RETRIEVE_LIMIT } from '../constants';
import { canRoleReceiveProcedure } from '../policy';
import type { AssistantActiveGoal } from '../activeGoal';
import type { AssistantSafeContext } from '../types';
import { listAssistantCapabilities } from './registry';
import type { AssistantCapability, AssistantCapabilityRetrieval } from './types';

const STOPWORDS = new Set([
  'como',
  'faco',
  'faco',
  'fazer',
  'para',
  'uma',
  'um',
  'onde',
  'quero',
  'coloco',
  'ponho',
  'altero',
  'muda',
  'essa',
  'deste',
  'desta',
  'outro',
  'nova',
  'novo',
  'sv',
  'lotes',
  'sistema',
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

function scoreCapability(
  capability: AssistantCapability,
  question: string,
  context: AssistantSafeContext,
  activeGoal?: AssistantActiveGoal | null,
): number {
  const haystack = normalize(
    [
      capability.id,
      capability.title,
      capability.module,
      capability.aliases.join(' '),
      capability.summary,
      (capability.controls || []).map((item) => item.label).join(' '),
      (capability.sequence || []).join(' '),
      (capability.fields || []).join(' '),
      capability.conclusion || '',
    ].join(' '),
  );
  const qn = normalize(question);
  const words = tokens(question);
  let score = 0;
  let matched = 0;
  for (const word of words) {
    if (haystack.includes(word)) {
      score += 3;
      matched += 1;
    }
    if (capability.aliases.some((alias) => normalize(alias) === word || normalize(alias).includes(word))) {
      score += 5;
      matched += 1;
    }
  }
  for (const alias of capability.aliases) {
    const t = normalize(alias);
    if (t.length >= 6 && qn.includes(t)) score += 14;
  }
  if (activeGoal?.id === capability.id) score += 24;
  if (capability.routes.some((route) => context.pathname === route || context.pathname.startsWith(`${route}/`))) {
    score += 6;
  }
  if (capability.module === context.moduleId) score += 4;
  if (matched === 0 && activeGoal?.id !== capability.id) return 0;
  return score;
}

export function retrieveAssistantCapabilities(input: {
  question: string;
  context: AssistantSafeContext;
  activeGoal?: AssistantActiveGoal | null;
  limit?: number;
  relax?: boolean;
}): AssistantCapabilityRetrieval {
  const all = listAssistantCapabilities();
  const limit = input.limit ?? Math.min(3, ASSISTANT_RETRIEVE_LIMIT + 1);
  const minScore = input.relax ? 5 : 8;
  const ranked = all
    .map((capability) => ({
      capability,
      score: scoreCapability(capability, input.question, input.context, input.activeGoal),
      decision: canRoleReceiveProcedure(
        {
          ...capability,
          tags: capability.aliases,
          objective: capability.summary,
          prerequisites: capability.preconditions || [],
          navigationPath: capability.sequence || [],
          steps: capability.sequence || [capability.summary],
          expectedResult: capability.result || '',
          commonErrors: [],
          limitations: capability.restrictions || [],
          modelDifferences: [],
          sourceOfTruth: capability.sourceOfTruth || [],
          uiLabels: (capability.controls || []).map((item) => item.label),
        },
        input.context,
      ),
    }))
    .sort((a, b) => b.score - a.score);

  const considered = ranked
    .filter((item) => item.score > 0)
    .slice(0, 8)
    .map((item) => item.capability.id);
  const pass = input.relax ? 2 : 1;
  const best = ranked[0];
  if (!best || best.score < minScore) {
    return { kind: 'unknown', capabilities: [], considered, pass };
  }
  if (!best.decision.allowed) {
    return {
      kind: 'forbidden',
      capabilities: [],
      considered,
      forbiddenReason: best.decision.reason === 'ok' ? 'profile' : best.decision.reason,
      pass,
    };
  }
  const allowed = ranked
    .filter((item) => item.score >= minScore && item.decision.allowed)
    .map((item) => item.capability);
  return { kind: 'answer', capabilities: allowed.slice(0, limit), considered, pass };
}
