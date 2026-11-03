import type { AssistantProcedure } from '../types';
import type { AssistantCapability } from './types';

function dottedId(procedure: AssistantProcedure): string {
  const tagged = procedure.tags.find((tag) => tag.includes('.'));
  if (tagged) return tagged;
  return procedure.id.replace(/-/g, '.');
}

export function capabilityFromProcedure(procedure: AssistantProcedure): AssistantCapability {
  return {
    id: dottedId(procedure),
    title: procedure.title,
    module: procedure.module,
    routes: procedure.routes,
    profiles: procedure.profiles,
    access: procedure.access,
    aliases: procedure.tags,
    summary: procedure.objective,
    origin: 'derived',
    confidence: 'medium',
    preconditions: procedure.prerequisites,
    controls: procedure.uiLabels.map((label) => ({ label })),
    sequence: procedure.steps.length > 0 ? procedure.steps : procedure.navigationPath,
    conclusion: procedure.uiLabels.at(-1),
    result: procedure.expectedResult,
    restrictions: procedure.limitations,
    knowledgeIds: [procedure.id],
    sourceOfTruth: procedure.sourceOfTruth,
  };
}
