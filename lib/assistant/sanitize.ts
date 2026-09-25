import { ASSISTANT_MAX_HISTORY_MESSAGES, ASSISTANT_MAX_QUESTION_CHARS } from './constants';
import type { AssistantChatTurn } from './types';

export function sanitizeAssistantQuestion(raw: string, max = ASSISTANT_MAX_QUESTION_CHARS): string {
  let text = String(raw || '')
    .replace(/\u0000/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .trim();
  if (!text) return '';

  text = text.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, '[redacted]');
  text = text.replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted-token]');
  text = text.replace(/\b\d{11}\b/g, '[documento]');
  text = text.replace(/\b\d{14}\b/g, '[documento]');
  text = text.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[documento]');
  text = text.replace(/\b(?:sk|rk|re)-[A-Za-z0-9]{8,}\b/g, '[redacted]');
  text = text.replace(/\b(?:wallet[_-]?id|asaas[_-]?wallet)\b[:\s=]*[A-Za-z0-9_-]{6,}/gi, '[redacted-wallet]');
  text = text.replace(/\b(?:agencia|agência|conta)\b[:\s]*[\d.-]{4,}/gi, '[redacted-banco]');
  text = text.replace(/service[_-]?role/gi, '[redacted]');
  return text.slice(0, max);
}

export function looksLikeSecretQuestion(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes('service_role') ||
    normalized.includes('service role') ||
    (normalized.includes('jwt') && normalized.includes('token')) ||
    normalized.includes('senha do') ||
    normalized.includes('api key') ||
    normalized.includes('wallet id')
  );
}

export function looksLikePromptInjection(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    /ignore (suas |as |todas as )?regras/.test(normalized) ||
    /ignore (your |all )?instructions/.test(normalized) ||
    /system prompt/.test(normalized) ||
    /mostre o prompt/.test(normalized) ||
    /revele (o |as )?instru/.test(normalized) ||
    /jailbreak/.test(normalized) ||
    /me passe (o )?token/.test(normalized)
  );
}

export function sanitizeAssistantHistory(raw: unknown): AssistantChatTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: AssistantChatTurn[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const role = (item as { role?: unknown }).role;
    const text = sanitizeAssistantQuestion(String((item as { text?: unknown }).text || ''), 400);
    if ((role === 'user' || role === 'assistant') && text) {
      out.push({ role, text });
    }
    if (out.length >= ASSISTANT_MAX_HISTORY_MESSAGES) break;
  }
  return out;
}

export function buildRetrievalQuery(question: string, history: AssistantChatTurn[]): string {
  const prior = history
    .filter((item) => item.role === 'user')
    .slice(-2)
    .map((item) => item.text);
  return [...prior, question].join('\n');
}
