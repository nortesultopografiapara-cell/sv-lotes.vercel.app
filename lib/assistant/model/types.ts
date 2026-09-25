import type { AssistantChatTurn, AssistantProcedure, AssistantSafeContext } from '../types';

export type AssistantModelMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type AssistantModelGenerateInput = {
  messages: AssistantModelMessage[];
  knowledge: AssistantProcedure[];
  context: AssistantSafeContext;
  history: AssistantChatTurn[];
  policy: {
    canAnswer: boolean;
    reason: 'ok' | 'unknown' | 'broker' | 'owner-write' | 'profile' | 'injection';
  };
};

export type AssistantModelGenerateResult = {
  text: string;
  providerId: string;
};

export type AssistantModelProvider = {
  id: string;
  available: () => boolean;
  generate: (input: AssistantModelGenerateInput) => Promise<AssistantModelGenerateResult>;
};
