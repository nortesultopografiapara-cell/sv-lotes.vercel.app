import { sanitizeAssistantQuestion } from '../sanitize';

export type AssistantKnowledgeGapReason =
  | 'no_match'
  | 'below_threshold'
  | 'rbac'
  | 'empty_question';

export function logAssistantKnowledgeGap(event: {
  intent: string;
  module: string;
  route: string;
  considered: string[];
  reason: AssistantKnowledgeGapReason;
}) {
  const intent = sanitizeAssistantQuestion(event.intent, 120);
  console.info('[assistant_knowledge_gap]', {
    intent,
    module: event.module,
    route: event.route,
    considered: event.considered.slice(0, 8),
    reason: event.reason,
  });
}
