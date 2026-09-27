/**
 * Paginação A4 do Editor CUSTOM — empacota blocos, não pinta faixa sobre o texto.
 * Não altera generateContractHTML nem contratos históricos.
 */

export const CUSTOM_A4_PAGE_MM = 297;
export const CUSTOM_A4_PAD_MM = 18;
export const CUSTOM_A4_GAP_PX = 18;
export const CUSTOM_A4_MIN_SPLIT_REMAINING_PX = 64;

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
};

export type A4SpacerPlan = {
  beforeUnitId: string;
  height: number;
  pageIndex: number;
};

export function mmToPx(mm: number, dpi = 96): number {
  return Math.round((Number(mm) / 25.4) * dpi);
}

export function customA4PageInnerPx(): number {
  return mmToPx(CUSTOM_A4_PAGE_MM - CUSTOM_A4_PAD_MM * 2);
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
 * Empilha unidades em folhas A4. Quebra só ENTRE unidades (nunca no meio de uma tr).
 * Parágrafos maiores que a folha começam no topo; a folha estica em vez de cortar o texto.
 */
export function planA4BlockSpacers(
  units: A4LayoutUnit[],
  pageInner: number,
  gap: number,
): A4SpacerPlan[] {
  const inner = Math.max(1, Number(pageInner) || 0);
  const gutter = Math.max(0, Number(gap) || 0);
  const spacers: A4SpacerPlan[] = [];
  let remaining = inner;
  let pageIndex = 0;
  let i = 0;

  const startNewPage = (beforeUnitId: string, extra = gutter) => {
    const height = Math.max(1, remaining + extra);
    spacers.push({ beforeUnitId, height, pageIndex });
    pageIndex += 1;
    remaining = inner;
  };

  while (i < units.length) {
    const unit = units[i];
    const height = Math.max(0, Number(unit.height) || 0);

    if (unit.kind === 'pageBreak') {
      if (remaining < inner) {
        startNewPage(unit.id, 0);
      } else {
        pageIndex += 1;
        remaining = inner;
      }
      i += 1;
      continue;
    }

    const next = i + 1 < units.length ? units[i + 1] : null;
    let packHeight = height;
    let packEnd = i;
    if (unit.keepWithNext && next && next.kind !== 'pageBreak') {
      const combined = height + Math.max(0, Number(next.height) || 0);
      if (combined <= inner) {
        packHeight = combined;
        packEnd = i + 1;
      } else if (remaining < inner && remaining < combined) {
        startNewPage(unit.id);
        continue;
      }
    }

    if (packHeight <= remaining) {
      remaining -= packHeight;
      i = packEnd + 1;
      continue;
    }

    if (remaining < inner) {
      startNewPage(unit.id);
      continue;
    }

    remaining = 0;
    i += 1;
    if (i < units.length) {
      startNewPage(units[i].id);
    }
  }

  return spacers;
}

export function countPagesFromA4Plan(units: A4LayoutUnit[], spacers: A4SpacerPlan[]): number {
  const forced = units.filter((unit) => unit.kind === 'pageBreak').length;
  return Math.max(1, spacers.length + 1, forced + 1);
}

export type A4DomUnit = A4LayoutUnit & { el: HTMLElement };

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
      height: Math.max(1, Math.ceil(el.getBoundingClientRect().height)),
      ...classified,
    });
  };

  for (const child of Array.from(root.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (child.classList.contains('sv-a4-flow-gap') || child.classList.contains('sv-a4-flow-gap-row')) {
      continue;
    }
    const tag = child.tagName.toLowerCase();
    const height = child.getBoundingClientRect().height;
    if (tag === 'table' && height > pageInner) {
      const rows = child.querySelectorAll('tr');
      rows.forEach((row) => {
        if (row instanceof HTMLElement && !row.classList.contains('sv-a4-flow-gap-row')) {
          pushEl(row, 'tr');
        }
      });
      continue;
    }
    if ((tag === 'ul' || tag === 'ol') && height > pageInner) {
      Array.from(child.children).forEach((item) => {
        if (item instanceof HTMLElement) pushEl(item, item.tagName);
      });
      continue;
    }
    pushEl(child);
  }
  return units;
}

export function applyCustomA4Pagination(root: HTMLElement): number {
  root.querySelectorAll('.sv-a4-flow-gap, .sv-a4-flow-gap-row').forEach((node) => node.remove());
  const pageInner = customA4PageInnerPx();
  const collected = collectA4UnitsFromElement(root, pageInner);
  const plan = planA4BlockSpacers(collected, pageInner, CUSTOM_A4_GAP_PX);
  for (let i = plan.length - 1; i >= 0; i -= 1) {
    const item = plan[i];
    const unit = collected.find((row) => row.id === item.beforeUnitId);
    if (!unit?.el) continue;
    const gap = createA4GapElement(unit.el, item.height);
    unit.el.before(gap);
  }
  return countPagesFromA4Plan(collected, plan);
}

function createA4GapElement(beforeEl: HTMLElement, height: number): HTMLElement {
  if (beforeEl.tagName.toLowerCase() === 'tr') {
    const tr = document.createElement('tr');
    tr.className = 'sv-a4-flow-gap-row';
    tr.setAttribute('contenteditable', 'false');
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
  gap.style.height = `${Math.max(1, height)}px`;
  return gap;
}
