/**
 * Footnotes do DOCX CUSTOM: referência no texto ↔ nota na mesma folha A4.
 * Não usa header/footer do Word. Não agrupa as notas depois das assinaturas.
 */

export const FOOTNOTE_REF_ATTR = 'data-sv-footnote-ref';
export const FOOTNOTE_ID_ATTR = 'data-sv-footnote-id';
export const FOOTNOTE_STORE_ATTR = 'data-sv-footnote-store';

export type CustomFootnoteNote = {
  id: string;
  mark: string;
  html: string;
};

const MAMMOTH_NOTE_LI_RE =
  /<li\b([^>]*)\bid=["']([^"']*footnote[-_](\d+))["']([^>]*)>([\s\S]*?)<\/li>/gi;
const MAMMOTH_REF_RE =
  /<sup>\s*<a\b[^>]*href=["']#([^"']*footnote[-_](\d+))["'][^>]*>\s*\[?(\d+)\]?\s*<\/a>\s*<\/sup>|<a\b[^>]*href=["']#([^"']*footnote[-_](\d+))["'][^>]*>\s*\[?(\d+)\]?\s*<\/a>/gi;
const BACK_LINK_RE =
  /<a\b[^>]*href=["']#[^"']*footnote-ref[^"']*["'][^>]*>\s*(?:↑|&uarr;|&#8593;)\s*<\/a>/gi;

export function stripFootnoteArtifacts(html: string): string {
  return String(html || '')
    .replace(BACK_LINK_RE, '')
    .replace(/\s↑\s*/g, ' ')
    .replace(/\s{2,}/g, ' ');
}

export function extractMammothFootnotes(html: string): CustomFootnoteNote[] {
  const notes: CustomFootnoteNote[] = [];
  const seen = new Set<string>();
  const source = String(html || '');
  for (const match of source.matchAll(MAMMOTH_NOTE_LI_RE)) {
    const mark = String(match[3] || '').trim();
    if (!mark) continue;
    const id = mark;
    if (seen.has(id)) continue;
    seen.add(id);
    const body = stripFootnoteArtifacts(String(match[5] || '')).trim();
    notes.push({ id, mark, html: body || '<p></p>' });
    seen.add(id);
  }
  return notes;
}

export function renderFootnoteRef(mark: string): string {
  const safe = String(mark || '').replace(/[^0-9A-Za-z_-]/g, '');
  if (!safe) return '';
  return `<sup ${FOOTNOTE_REF_ATTR}="${safe}" class="sv-fn-ref">${safe}</sup>`;
}

export function renderFootnoteDefinition(note: CustomFootnoteNote): string {
  const inner = String(note.html || '').trim() || '<p></p>';
  return `<aside ${FOOTNOTE_ID_ATTR}="${note.id}" class="sv-footnote" data-sv-footnote-mark="${note.mark}">${inner}</aside>`;
}

export function renderFootnoteStore(notes: CustomFootnoteNote[]): string {
  if (!notes.length) return '';
  return `<section ${FOOTNOTE_STORE_ATTR}="true" class="sv-footnote-store">${notes
    .map((note) => renderFootnoteDefinition(note))
    .join('')}</section>`;
}

function replaceMammothRefs(html: string): string {
  return String(html || '').replace(
    MAMMOTH_REF_RE,
    (
      _full,
      _hrefA?: string,
      markA?: string,
      visibleA?: string,
      _hrefB?: string,
      markB?: string,
      visibleB?: string,
    ) => {
      const mark = String(markA || markB || visibleA || visibleB || '').trim();
      return renderFootnoteRef(mark);
    },
  );
}

function removeConsumedFootnoteLists(html: string): string {
  return String(html || '').replace(/<ol\b[^>]*>[\s\S]*?<\/ol>/gi, (block) => {
    if (!/footnote[-_]\d+/i.test(block)) return block;
    const leftover = block.replace(MAMMOTH_NOTE_LI_RE, '');
    const stillHasItem = /<li\b/i.test(leftover);
    return stillHasItem ? leftover : '';
  });
}

export function normalizeCustomFootnotesHtml(html: string): string {
  let source = stripFootnoteArtifacts(html);
  if (/data-sv-footnote-store/i.test(source) && /data-sv-footnote-ref/i.test(source)) {
    return source;
  }
  const notes = extractMammothFootnotes(source);
  if (!notes.length) {
    return replaceMammothRefs(source);
  }
  let body = removeConsumedFootnoteLists(source);
  body = replaceMammothRefs(body);
  if (!/data-sv-footnote-store/i.test(body)) {
    body += renderFootnoteStore(notes);
  }
  return body;
}

export function extractFootnoteRefIdsFromHtml(html: string): string[] {
  const ids: string[] = [];
  const re = /data-sv-footnote-ref=["']([^"']+)["']/gi;
  for (const match of String(html || '').matchAll(re)) {
    const id = String(match[1] || '').trim();
    if (id) ids.push(id);
  }
  return ids;
}

export function collectFootnoteIdsFromElement(el: Element): string[] {
  return Array.from(el.querySelectorAll(`[${FOOTNOTE_REF_ATTR}]`))
    .map((node) => String(node.getAttribute(FOOTNOTE_REF_ATTR) || '').trim())
    .filter(Boolean);
}

export function uniqueFootnoteIds(ids: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
