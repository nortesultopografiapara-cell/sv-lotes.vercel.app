/**
 * HTML do modelo CUSTOM: chips visuais ↔ tokens {{CAMPO}} persistidos.
 * Sem DOM. Sem GIS.
 */
import {
  CUSTOM_PLACEHOLDER_KEYS,
  customPlaceholderLabel,
  customPlaceholderToken,
  findCustomPlaceholder,
  missingPlaceholderMarker,
} from '@/lib/customContractPlaceholders';

const PLACEHOLDER_SPAN_RE =
  /<span\b[^>]*\bdata-sv-placeholder=["']([A-Z0-9_]+)["'][^>]*>[\s\S]*?<\/span>/gi;
const BARE_TOKEN_RE = /\{\{\s*([A-Z0-9_]+)\s*\}\}/g;

export function renderPlaceholderSpan(key: string): string {
  const token = customPlaceholderToken(key);
  const safe = String(key || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '');
  if (!safe) return '';
  return `<span data-sv-placeholder="${safe}" class="sv-contract-placeholder" contenteditable="false">${token}</span>`;
}

export function hydrateCustomPlaceholderHtml(html: string): string {
  const source = String(html || '');
  return source.replace(
    /<span\b[^>]*\bdata-sv-placeholder=["']([A-Z0-9_]+)["'][^>]*>[\s\S]*?<\/span>|\{\{\s*([A-Z0-9_]+)\s*\}\}/gi,
    (full, fromAttr: string | undefined, fromToken: string | undefined) => {
      const key = String(fromAttr || fromToken || '')
        .trim()
        .toUpperCase();
      if (!CUSTOM_PLACEHOLDER_KEYS.has(key)) return full;
      return renderPlaceholderSpan(key);
    },
  );
}

/** Texto canônico para comparar rascunho × publicada (ignora chips/rótulos/whitespace). */
export function canonicalizeCustomContractHtml(html: string): string {
  let s = String(html || '');
  s = s.replace(PLACEHOLDER_SPAN_RE, (_full, key: string) => customPlaceholderToken(key));
  s = s.replace(BARE_TOKEN_RE, (_full, key: string) => customPlaceholderToken(key));
  s = s.replace(/&nbsp;/gi, ' ');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|h1|h2|h3|h4|li|tr)>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/[ \t]+/g, ' ');
  s = s.replace(/\n+/g, '\n');
  return s.trim();
}

export function highlightCustomPlaceholdersForPreview(html: string): string {
  const hydrated = hydrateCustomPlaceholderHtml(html);
  return hydrated.replace(PLACEHOLDER_SPAN_RE, (_full, key: string) => {
    const label = customPlaceholderLabel(key);
    const token = customPlaceholderToken(key);
    return `<span class="sv-contract-placeholder sv-contract-placeholder--preview" data-sv-placeholder="${key}" title="${token}">${escapeHtml(label)}</span>`;
  });
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const DANGEROUS_TAGS = /<\/?(script|style|iframe|object|embed|link|meta|form|input|button|textarea|svg|math)[^>]*>/gi;

export function sanitizeImportedContractHtml(raw: string): string {
  let html = String(raw || '');
  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(html);
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<style[\s\S]*?<\/style>/gi, '');
  html = html.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
  html = html.replace(/<object[\s\S]*?<\/object>/gi, '');
  html = html.replace(/<embed[\s\S]*?>/gi, '');
  html = html.replace(DANGEROUS_TAGS, '');
  html = html.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  html = html.replace(/javascript:/gi, '');
  html = html.replace(/data:text\/html/gi, '');
  html = html.replace(/\ssrc\s*=\s*(['"])(?!https?:|data:image\/)[^'"]*\1/gi, '');
  if (!looksLikeHtml) {
    const parts = html
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (parts.length === 0) return '';
    return parts.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
  }
  return html.trim();
}

export function isRejectedImportMime(mime: string | null | undefined, fileName?: string | null): boolean {
  const name = String(fileName || '').toLowerCase();
  const type = String(mime || '').toLowerCase();
  if (name.endsWith('.pdf') || type.includes('pdf')) return true;
  if (name.endsWith('.doc') && !name.endsWith('.docx')) return true;
  if (type.includes('msword') && !type.includes('wordprocessingml')) return true;
  return false;
}

export function countVisualA4Pages(html: string): number {
  const breaks = (String(html || '').match(/data-sv-page-break/gi) || []).length;
  return Math.max(1, breaks + 1);
}

export function fillCustomPlaceholdersForPreview(
  html: string,
  values: Record<string, string | null>,
): string {
  const hydrated = hydrateCustomPlaceholderHtml(html);
  const replacedSpans = hydrated.replace(PLACEHOLDER_SPAN_RE, (_full, key: string) => {
    const normalized = String(key || '').toUpperCase();
    const raw = values[normalized];
    if (raw == null || !String(raw).trim()) {
      return `<span class="sv-missing-placeholder">${escapeHtml(
        missingPlaceholderMarker(customPlaceholderLabel(normalized)),
      )}</span>`;
    }
    if (normalized === 'COMPANY_LOGO_URL' && /^(https?:|data:image\/)/i.test(raw)) {
      return `<img src="${escapeHtml(raw)}" alt="Logo" class="sv-preview-logo" />`;
    }
    return `<span class="sv-filled-placeholder">${escapeHtml(raw)}</span>`;
  });
  return replacedSpans.replace(BARE_TOKEN_RE, (full, key: string) => {
    const normalized = String(key || '').toUpperCase();
    if (values[normalized] === undefined && !CUSTOM_PLACEHOLDER_KEYS.has(normalized) && !/^SELLER_\d+_/.test(normalized)) {
      return full;
    }
    const raw = values[normalized];
    if (raw == null || !String(raw).trim()) {
      return `<span class="sv-missing-placeholder">${escapeHtml(
        missingPlaceholderMarker(customPlaceholderLabel(normalized)),
      )}</span>`;
    }
    return `<span class="sv-filled-placeholder">${escapeHtml(raw)}</span>`;
  });
}

export function extractPlaceholderKeys(html: string): string[] {
  const keys = new Set<string>();
  const source = String(html || '');
  for (const match of source.matchAll(PLACEHOLDER_SPAN_RE)) {
    if (findCustomPlaceholder(match[1])) keys.add(match[1]);
  }
  for (const match of source.matchAll(BARE_TOKEN_RE)) {
    const key = String(match[1] || '').toUpperCase();
    if (findCustomPlaceholder(key)) keys.add(key);
  }
  return [...keys];
}
