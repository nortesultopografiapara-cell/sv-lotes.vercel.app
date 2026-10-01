/**
 * Paginação A4 do Editor CUSTOM — empacota blocos, não pinta faixa sobre o texto.
 *
 * Determinismo: o mesmo conjunto de blocos + a mesma largura Inner deve produzir
 * sempre o mesmo recorte de páginas. Notas de rodapé NÃO entram no empacotamento
 * (evitam o ciclo ref muda de página → nota muda → espaço muda → bloco volta).
 * A medição ignora faixas/notas visuais inseridas pela própria paginação.
 * Não altera generateContractHTML nem contratos históricos.
 */

import {
  collectFootnoteIdsFromElement,
  uniqueFootnoteIds,
} from '@/lib/customContractFootnotes';

export const CUSTOM_A4_PAGE_MM = 297;
export const CUSTOM_A4_PAD_MM = 18;
export const CUSTOM_A4_GAP_PX = 18;
export const CUSTOM_A4_MIN_SPLIT_REMAINING_PX = 64;
export const A4_PAGE_IDENTITY_ATTR = 'data-sv-a4-identity';

export type A4LayoutKind =
  | 'heading'
  | 'paragraph'
  | 'table'
  | 'tableRow'
  | 'list'
  | 'listItem'
  | 'pageBreak'
  | 'signature'
  | 'logo'
  | 'other';

export type A4LayoutUnit = {
  id: string;
  kind: A4LayoutKind;
  height: number;
  keepTogether: boolean;
  keepWithNext: boolean;
  footnoteIds?: string[];
};

export type A4SpacerPlan = {
  beforeUnitId: string;
  height: number;
  pageIndex: number;
};

export type A4PagePlan = {
  start: number;
  end: number;
  leftover: number;
  footnoteIds: string[];
  footnoteHeight: number;
  pageIndex: number;
};

export function roundA4Measure(px: number): number {
  const value = Number(px);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(1, Math.round(value));
}

export function mmToPx(mm: number, dpi = 96): number {
  return Math.round((Number(mm) / 25.4) * dpi);
}

export function customA4PageInnerPx(): number {
  return mmToPx(CUSTOM_A4_PAGE_MM - CUSTOM_A4_PAD_MM * 2);
}

export function a4PageIdentity(pages: A4PagePlan[]): string {
  return pages
    .map((page) => `${page.start}:${page.end}:${(page.footnoteIds || []).join(',')}`)
    .join('|');
}

export function shouldExplodeTableByHeight(contentHeight: number, pageInner: number): boolean {
  return roundA4Measure(contentHeight) > roundA4Measure(pageInner);
}

export function a4SpacerHeight(leftover: number, footnoteHeight: number, gap: number): number {
  const rest = roundA4Measure(leftover) - roundA4Measure(footnoteHeight);
  return Math.max(gap, rest + gap);
}

export function looksLikeSignatureBlock(text: string): boolean {
  const value = String(text || '');
  if (/_{4,}/.test(value)) return true;
  if (/assinatura/i.test(value) && value.length < 280) return true;
  if (/testemunha\s*[12]?/i.test(value) && value.length < 220) return true;
  if (/^\s*cpf\s*:/i.test(value.trim()) && value.length < 180) return true;
  return false;
}

export function classifyA4Tag(
  tagName: string,
  text: string,
  attrs: { pageBreak?: boolean; companyLogo?: boolean } = {},
): Pick<A4LayoutUnit, 'kind' | 'keepTogether' | 'keepWithNext'> {
  if (attrs.pageBreak) {
    return { kind: 'pageBreak', keepTogether: true, keepWithNext: false };
  }
  if (attrs.companyLogo) {
    return { kind: 'logo', keepTogether: true, keepWithNext: false };
  }
  const tag = String(tagName || '').toLowerCase();
  if (/^h[1-4]$/.test(tag)) {
    return { kind: 'heading', keepTogether: true, keepWithNext: true };
  }
  if (tag === 'table') {
    return { kind: 'table', keepTogether: true, keepWithNext: false };
  }
  if (tag === 'tr') {
    return { kind: 'tableRow', keepTogether: true, keepWithNext: false };
  }
  if (tag === 'li') {
    return { kind: 'listItem', keepTogether: true, keepWithNext: false };
  }
  if (tag === 'ul' || tag === 'ol') {
    return { kind: 'list', keepTogether: true, keepWithNext: false };
  }
  if (looksLikeSignatureBlock(text)) {
    return { kind: 'signature', keepTogether: true, keepWithNext: true };
  }
  if (tag === 'p' || tag === 'blockquote') {
    return { kind: 'paragraph', keepTogether: false, keepWithNext: false };
  }
  return { kind: 'other', keepTogether: true, keepWithNext: false };
}

/**
 * Empacota só o conteúdo. `footnoteHeightFor` preenche a altura visual da nota
 * (para a faixa de leftover), mas NÃO reduz o espaço disponível dos blocos —
 * isso era a oscilação referência ↔ nota ↔ bloco.
 */
export function planA4Pages(
  units: A4LayoutUnit[],
  pageInner: number,
  gap: number,
  footnoteHeightFor: (ids: string[]) => number = () => 0,
): A4PagePlan[] {
  const inner = Math.max(1, roundA4Measure(pageInner) || Number(pageInner) || 1);
  const pages: A4PagePlan[] = [];
  let start = 0;
  let remaining = inner;
  let pageIndex = 0;
  let pageRefs: string[] = [];
  let i = 0;

  const closePage = (endExclusive: number) => {
    if (endExclusive <= start && pages.length && endExclusive === start) {
      remaining = inner;
      pageRefs = [];
      pageIndex += 1;
      return;
    }
    const ids = uniqueFootnoteIds(pageRefs);
    pages.push({
      start,
      end: Math.max(start, endExclusive - 1),
      leftover: remaining,
      footnoteIds: ids,
      footnoteHeight: roundA4Measure(footnoteHeightFor(ids)),
      pageIndex,
    });
    start = endExclusive;
    remaining = inner;
    pageRefs = [];
    pageIndex += 1;
  };

  while (i < units.length) {
    const unit = units[i];
    const height = Math.max(0, roundA4Measure(unit.height) || Number(unit.height) || 0);

    if (unit.kind === 'pageBreak') {
      if (i > start) closePage(i);
      else {
        remaining = inner;
        pageRefs = [];
        pageIndex += 1;
        start = i + 1;
      }
      i += 1;
      start = i;
      remaining = inner;
      pageRefs = [];
      continue;
    }

    const next = i + 1 < units.length ? units[i + 1] : null;
    let packHeight = height;
    let packEnd = i;
    let packRefs = [...(unit.footnoteIds || [])];
    if (unit.keepWithNext && next && next.kind !== 'pageBreak') {
      const combined = height + Math.max(0, roundA4Measure(next.height) || Number(next.height) || 0);
      if (combined <= inner) {
        packHeight = combined;
        packEnd = i + 1;
        packRefs = [...packRefs, ...(next.footnoteIds || [])];
      } else if (remaining < inner && remaining < combined) {
        closePage(i);
        continue;
      }
    }

    if (packHeight > remaining && remaining < inner) {
      closePage(i);
      continue;
    }

    remaining = Math.max(0, remaining - packHeight);
    pageRefs = uniqueFootnoteIds([...pageRefs, ...packRefs]);
    i = packEnd + 1;
  }

  if (start < units.length || pages.length === 0) {
    closePage(units.length);
  }

  void gap;
  return pages;
}

export function planA4BlockSpacers(
  units: A4LayoutUnit[],
  pageInner: number,
  gap: number,
): A4SpacerPlan[] {
  const pages = planA4Pages(units, pageInner, gap, () => 0);
  const spacers: A4SpacerPlan[] = [];
  for (let p = 1; p < pages.length; p += 1) {
    const prev = pages[p - 1];
    const page = pages[p];
    const before = units[page.start];
    if (!before) continue;
    spacers.push({
      beforeUnitId: before.id,
      height: Math.max(1, prev.leftover + gap),
      pageIndex: prev.pageIndex,
    });
  }
  return spacers;
}

export function countPagesFromA4Plan(units: A4LayoutUnit[], spacers: A4SpacerPlan[]): number {
  const forced = units.filter((unit) => unit.kind === 'pageBreak').length;
  return Math.max(1, spacers.length + 1, forced + 1);
}

export type A4DomUnit = A4LayoutUnit & { el: HTMLElement };

export function isA4PaginationArtifact(el: HTMLElement): boolean {
  return (
    el.classList.contains('sv-a4-flow-gap') ||
    el.classList.contains('sv-a4-flow-gap-row') ||
    el.classList.contains('sv-a4-flow-gap-cell') ||
    el.classList.contains('sv-page-footnotes') ||
    el.classList.contains('sv-page-footnotes-row') ||
    el.classList.contains('sv-footnote-store') ||
    el.hasAttribute('data-sv-a4-artifact') ||
    el.hasAttribute('data-sv-footnote-store')
  );
}

export function tableContentHeight(tableEl: HTMLElement): number {
  let height = 0;
  tableEl.querySelectorAll('tr').forEach((row) => {
    if (!(row instanceof HTMLElement) || isA4PaginationArtifact(row)) return;
    height += roundA4Measure(row.getBoundingClientRect().height);
  });
  return height;
}

function measureUnitHeight(el: HTMLElement): number {
  return roundA4Measure(el.getBoundingClientRect().height);
}

export function collectA4UnitsFromElement(root: HTMLElement, pageInner: number): A4DomUnit[] {
  const units: A4DomUnit[] = [];
  let index = 0;
  const pushEl = (el: HTMLElement, tag = el.tagName) => {
    const classified = classifyA4Tag(tag, el.innerText || el.textContent || '', {
      pageBreak: el.hasAttribute('data-sv-page-break') || el.classList.contains('sv-page-break'),
      companyLogo:
        el.hasAttribute('data-sv-company-logo') ||
        el.getAttribute('data-sv-placeholder') === 'COMPANY_LOGO_URL',
    });
    units.push({
      id: `u${index++}`,
      el,
      height: Math.max(1, measureUnitHeight(el)),
      footnoteIds: collectFootnoteIdsFromElement(el),
      ...classified,
    });
  };

  for (const child of Array.from(root.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (isA4PaginationArtifact(child)) continue;
    const tag = child.tagName.toLowerCase();
    const tableEl =
      tag === 'table' ? child : child.classList.contains('tableWrapper') ? child.querySelector('table') : null;
    if (tableEl instanceof HTMLElement && shouldExplodeTableByHeight(tableContentHeight(tableEl), pageInner)) {
      tableEl.querySelectorAll('tr').forEach((row) => {
        if (row instanceof HTMLElement && !isA4PaginationArtifact(row)) {
          pushEl(row, 'tr');
        }
      });
      continue;
    }
    if ((tag === 'ul' || tag === 'ol') && measureUnitHeight(child) > pageInner) {
      Array.from(child.children).forEach((item) => {
        if (item instanceof HTMLElement && !isA4PaginationArtifact(item)) pushEl(item, item.tagName);
      });
      continue;
    }
    pushEl(child);
  }
  return units;
}

export function measureFootnoteClusterHeight(
  storeRoot: HTMLElement | null,
  ids: string[],
): number {
  const unique = uniqueFootnoteIds(ids);
  if (!unique.length) return 0;
  let height = 10;
  for (const id of unique) {
    const el = storeRoot?.querySelector(`[data-sv-footnote-id="${CSS.escape(id)}"]`) as HTMLElement | null;
    height += el ? Math.max(22, roundA4Measure(el.scrollHeight || el.getBoundingClientRect().height || 0)) : 28;
  }
  return height;
}

function createFootnoteCluster(storeRoot: HTMLElement | null, ids: string[]): HTMLElement | null {
  const unique = uniqueFootnoteIds(ids);
  if (!unique.length) return null;
  const wrap = document.createElement('div');
  wrap.className = 'sv-page-footnotes';
  wrap.setAttribute('contenteditable', 'false');
  wrap.setAttribute('data-sv-a4-artifact', 'true');
  unique.forEach((id) => {
    const source = storeRoot?.querySelector(`[data-sv-footnote-id="${CSS.escape(id)}"]`);
    const note = document.createElement('div');
    note.className = 'sv-page-footnote';
    const mark = document.createElement('span');
    mark.className = 'sv-fn-mark';
    mark.textContent = id;
    note.appendChild(mark);
    const body = document.createElement('div');
    body.className = 'sv-fn-body';
    body.innerHTML = source ? source.innerHTML : '';
    note.appendChild(body);
    wrap.appendChild(note);
  });
  return wrap;
}

export function applyCustomA4Pagination(root: HTMLElement): number {
  const pageInner = customA4PageInnerPx();
  const collected = collectA4UnitsFromElement(root, pageInner);
  const store = root.querySelector('[data-sv-footnote-store], .sv-footnote-store') as HTMLElement | null;
  const pages = planA4Pages(collected, pageInner, CUSTOM_A4_GAP_PX, (ids) =>
    measureFootnoteClusterHeight(store, ids),
  );
  const identity = a4PageIdentity(pages);
  const pageCount = Math.max(1, pages.length);
  if (root.getAttribute(A4_PAGE_IDENTITY_ATTR) === identity) {
    return pageCount;
  }

  root.querySelectorAll('.sv-a4-flow-gap, .sv-a4-flow-gap-row, .sv-page-footnotes').forEach((node) =>
    node.remove(),
  );
  for (let p = pages.length - 1; p >= 0; p -= 1) {
    const page = pages[p];
    const last = collected[page.end];
    const next = collected[page.end + 1];
    const cluster = createFootnoteCluster(store, page.footnoteIds);
    if (cluster && last?.el) {
      if (next?.el) next.el.before(cluster);
      else last.el.after(cluster);
    }
    if (next?.el) {
      const spacerHeight = a4SpacerHeight(page.leftover, page.footnoteHeight, CUSTOM_A4_GAP_PX);
      const gap = createA4GapElement(next.el, spacerHeight);
      next.el.before(gap);
    }
  }
  root.setAttribute(A4_PAGE_IDENTITY_ATTR, identity);
  return pageCount;
}

function createA4GapElement(beforeEl: HTMLElement, height: number): HTMLElement {
  if (beforeEl.tagName.toLowerCase() === 'tr') {
    const tr = document.createElement('tr');
    tr.className = 'sv-a4-flow-gap-row';
    tr.setAttribute('contenteditable', 'false');
    tr.setAttribute('data-sv-a4-artifact', 'true');
    const td = document.createElement('td');
    td.colSpan = Math.max(1, beforeEl.children.length);
    td.className = 'sv-a4-flow-gap-cell';
    td.style.height = `${Math.max(1, height)}px`;
    tr.appendChild(td);
    return tr;
  }
  const gap = document.createElement('div');
  gap.className = 'sv-a4-flow-gap';
  gap.setAttribute('contenteditable', 'false');
  gap.setAttribute('data-sv-a4-artifact', 'true');
  gap.style.height = `${Math.max(1, height)}px`;
  return gap;
}
