import { googleGenerativeProvider } from './googleGenAiProvider';
import { localGroundedProvider } from './localGroundedProvider';
import type { AssistantModelProvider } from './types';

export function resolveAssistantModelProvider(): {
  primary: AssistantModelProvider;
  fallback: AssistantModelProvider;
} {
  if (googleGenerativeProvider.available()) {
    return { primary: googleGenerativeProvider, fallback: localGroundedProvider };
  }
  return { primary: localGroundedProvider, fallback: localGroundedProvider };
}
