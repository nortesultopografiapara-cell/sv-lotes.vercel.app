import { ASSISTANT_CONTINUE_OFFER } from '../constants';
import type { AssistantCapability } from './types';

export function composeFromCapability(capability: AssistantCapability, alreadyOnRoute = false): string {
  const sequence = (capability.sequence || []).filter(Boolean);
  const start = alreadyOnRoute
    ? sequence.filter((step) => !/abra /i.test(step)).slice(0, 4)
    : sequence.slice(0, 4);
  const lines = start.length > 0 ? start : [capability.summary];
  const conclusion = capability.conclusion ? ` Conclusão: ${capability.conclusion}.` : '';
  return `${lines.join(' ')}${conclusion} ${ASSISTANT_CONTINUE_OFFER}`.replace(/\s+/g, ' ').trim();
}
