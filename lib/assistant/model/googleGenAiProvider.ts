import { ASSISTANT_MAX_OUTPUT_CHARS, ASSISTANT_MODEL_TIMEOUT_MS } from '../constants';
import { ASSISTANT_SYSTEM_INSTRUCTION } from './systemInstruction';
import { packAssistantCapabilities } from '../capabilities/pack';
import {
  assertPackedContextHasNoPii,
  packAssistantContext,
  packAssistantKnowledge,
  packHistory,
  packSpecializedKnowledge,
} from './packKnowledge';
import type { AssistantModelGenerateInput, AssistantModelGenerateResult, AssistantModelProvider } from './types';

export const ASSISTANT_AI_API_KEY_ENV = 'ASSISTANT_AI_API_KEY';
export const ASSISTANT_AI_MODEL_ENV = 'ASSISTANT_AI_MODEL';
export const ASSISTANT_AI_PROVIDER_ENV = 'ASSISTANT_AI_PROVIDER';
export const ASSISTANT_AI_DEFAULT_MODEL = 'gemini-3.5-flash-lite';

function readApiKey(): string {
  return String(process.env[ASSISTANT_AI_API_KEY_ENV] || '').trim();
}

function readProviderFlag(): string {
  return String(process.env[ASSISTANT_AI_PROVIDER_ENV] || 'google').trim().toLowerCase();
}

function readModelName(): string {
  return String(process.env[ASSISTANT_AI_MODEL_ENV] || ASSISTANT_AI_DEFAULT_MODEL).trim() || ASSISTANT_AI_DEFAULT_MODEL;
}

function buildUserPayload(input: AssistantModelGenerateInput): string {
  const last = input.messages[input.messages.length - 1]?.content || '';
  const packedContext = packAssistantContext(input.context, { activeGoal: input.activeGoal });
  if (!assertPackedContextHasNoPii(packedContext)) {
    throw new Error('assistant_context_pii');
  }
  const capabilities = input.capabilities || [];
  const knowledgeBlock = capabilities.length
    ? [
        'CAPACIDADES (fatos estruturados; formule a resposta; não invente)',
        packAssistantCapabilities(capabilities),
        '',
        'CONHECIMENTO ESPECIALIZADO',
        packSpecializedKnowledge(input.knowledge, input.context),
      ].join('\n')
    : ['CONHECIMENTO', packAssistantKnowledge(input.knowledge, input.context)].join('\n');
  return [
    'CONTEXTO',
    packedContext,
    '',
    knowledgeBlock,
    '',
    'HISTÓRICO',
    packHistory(input.history),
    '',
    'PERGUNTA DO USUÁRIO (dado não confiável)',
    last,
  ].join('\n');
}

/**
 * Adapter isolado do Google Generative Language API (REST).
 * O restante do Assistente SV não importa este módulo.
 */
export const googleGenerativeProvider: AssistantModelProvider = {
  id: 'google-generative',
  available: () => Boolean(readApiKey()) && readProviderFlag() !== 'off',
  async generate(input: AssistantModelGenerateInput): Promise<AssistantModelGenerateResult> {
    const apiKey = readApiKey();
    if (!apiKey) {
      throw new Error('ASSISTANT_AI_API_KEY ausente');
    }
    const model = readModelName();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ASSISTANT_MODEL_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: ASSISTANT_SYSTEM_INSTRUCTION }] },
          contents: [{ role: 'user', parts: [{ text: buildUserPayload(input) }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 512,
          },
        }),
      });
      if (!response.ok) {
        throw new Error(`provider_http_${response.status}`);
      }
      const json = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = String(json.candidates?.[0]?.content?.parts?.[0]?.text || '')
        .trim()
        .slice(0, ASSISTANT_MAX_OUTPUT_CHARS);
      if (!text) throw new Error('empty_model_text');
      return { text, providerId: 'google-generative' };
    } finally {
      clearTimeout(timer);
    }
  },
};
