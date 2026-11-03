import { ASSISTANT_READONLY_TOOL_IDS, type AssistantReadonlyToolId } from './types';

export function isAssistantReadonlyToolId(value: string): value is AssistantReadonlyToolId {
  return (ASSISTANT_READONLY_TOOL_IDS as readonly string[]).includes(value);
}

export const ASSISTANT_READONLY_TOOL_ALLOWLIST = ASSISTANT_READONLY_TOOL_IDS;
