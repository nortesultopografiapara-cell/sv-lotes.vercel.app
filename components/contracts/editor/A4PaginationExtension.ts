import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';
import {
  CUSTOM_A4_GAP_PX,
  a4PageIdentity,
  a4SpacerHeight,
  cloneRepeatedTableHeader,
  collectA4UnitsFromElement,
  customA4PageInnerPx,
  isTableHeaderRow,
  measureFootnoteClusterHeight,
  planA4Pages,
} from '@/lib/customContractA4Layout';

const a4PaginationKey = new PluginKey('svCustomA4Pagination');

function headerWidget(rowHtml: string) {
  return () => {
    const wrap = document.createElement('tbody');
    wrap.innerHTML = rowHtml;
    const tr = wrap.querySelector('tr') || document.createElement('tr');
    tr.classList.add('sv-a4-repeated-header');
    tr.setAttribute('contenteditable', 'false');
    tr.setAttribute('data-sv-a4-artifact', 'true');
    return tr;
  };
}

function spacerWidget(height: number, isRow: boolean, colCount: number) {
  return () => {
    if (isRow) {
      const tr = document.createElement('tr');
      tr.className = 'sv-a4-flow-gap-row';
      tr.setAttribute('contenteditable', 'false');
      tr.setAttribute('data-sv-a4-artifact', 'true');
      const td = document.createElement('td');
      td.colSpan = Math.max(1, colCount);
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
  };
}

function footnoteWidget(html: string, isRow: boolean, colCount: number) {
  return () => {
    if (isRow) {
      const tr = document.createElement('tr');
      tr.className = 'sv-page-footnotes sv-page-footnotes-row';
      tr.setAttribute('contenteditable', 'false');
      tr.setAttribute('data-sv-a4-artifact', 'true');
      const td = document.createElement('td');
      td.colSpan = Math.max(1, colCount);
      td.className = 'sv-page-footnotes-cell';
      td.innerHTML = html;
      tr.appendChild(td);
      return tr;
    }
    const wrap = document.createElement('div');
    wrap.className = 'sv-page-footnotes';
    wrap.setAttribute('contenteditable', 'false');
    wrap.setAttribute('data-sv-a4-artifact', 'true');
    wrap.innerHTML = html;
    return wrap;
  };
}

function clusterHtml(store: HTMLElement | null, ids: string[]): string {
  return ids
    .map((id) => {
      const source = store?.querySelector(`[data-sv-footnote-id="${id}"]`);
      const body = source ? source.innerHTML : '';
      return `<div class="sv-page-footnote"><span class="sv-fn-mark">${id}</span><div class="sv-fn-body">${body}</div></div>`;
    })
    .join('');
}

function posFor(view: EditorView, el: HTMLElement, atEnd: boolean): number {
  try {
    return view.posAtDOM(el, atEnd ? el.childNodes.length : 0);
  } catch {
    return -1;
  }
}

function findScrollParent(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
    node = node.parentElement;
  }
  return null;
}

function refreshA4Decorations(view: EditorView, onPageCount?: (count: number) => void) {
  const pageInner = customA4PageInnerPx();
  const collected = collectA4UnitsFromElement(view.dom as HTMLElement, pageInner);
  const store = view.dom.querySelector('[data-sv-footnote-store], .sv-footnote-store') as HTMLElement | null;
  const pages = planA4Pages(collected, pageInner, CUSTOM_A4_GAP_PX, (ids) =>
    measureFootnoteClusterHeight(store, ids),
  );
  const identity = a4PageIdentity(pages);
  const prev = a4PaginationKey.getState(view.state);
  const pageCount = Math.max(1, pages.length);
  if (identity === prev?.identity) {
    if (prev.pageCount !== pageCount) onPageCount?.(pageCount);
    return;
  }

  const decorations: Decoration[] = [];
  for (let p = 0; p < pages.length; p += 1) {
    const page = pages[p];
    const last = collected[page.end];
    const next = collected[page.end + 1];
    if (page.footnoteIds.length && last?.el) {
      const html = clusterHtml(store, page.footnoteIds);
      const isRow = last.el.tagName.toLowerCase() === 'tr';
      const pos = posFor(view, last.el, true);
      if (pos >= 0) {
        decorations.push(
          Decoration.widget(pos, footnoteWidget(html, isRow, last.el.children.length), {
            side: 1,
            ignoreSelection: true,
            key: `fn-${page.pageIndex}-${page.footnoteIds.join(',')}`,
          }),
        );
      }
    }
    if (next?.el) {
      const spacerHeight = a4SpacerHeight(page.leftover, page.footnoteHeight, CUSTOM_A4_GAP_PX);
      const pos = posFor(view, next.el, false);
      if (pos >= 0) {
        decorations.push(
          Decoration.widget(
            pos,
            spacerWidget(spacerHeight, next.el.tagName.toLowerCase() === 'tr', next.el.children.length),
            {
              side: -1,
              ignoreSelection: true,
              key: `a4-${page.pageIndex}-${page.start}-${page.end}`,
            },
          ),
        );
        const lastTable = last?.el?.closest('table');
        const nextTable = next.el.closest('table');
        if (
          lastTable &&
          nextTable &&
          lastTable === nextTable &&
          next.el.tagName.toLowerCase() === 'tr' &&
          !isTableHeaderRow(next.el)
        ) {
          cloneRepeatedTableHeader(lastTable).forEach((row, headerIndex) => {
            decorations.push(
              Decoration.widget(pos, headerWidget(row.outerHTML), {
                side: -1,
                ignoreSelection: true,
                key: `th-${page.pageIndex}-${headerIndex}`,
              }),
            );
          });
        }
      }
    }
  }

  const nextSet = DecorationSet.create(view.state.doc, decorations);
  const scrollEl = findScrollParent(view.dom as HTMLElement);
  const scrollTop = scrollEl?.scrollTop ?? 0;
  const tr = view.state.tr
    .setMeta(a4PaginationKey, { set: nextSet, identity, pageCount })
    .setMeta('addToHistory', false);
  view.dispatch(tr);
  if (scrollEl && scrollEl.scrollTop !== scrollTop) {
    scrollEl.scrollTop = scrollTop;
  }
  onPageCount?.(pageCount);
}

export const A4Pagination = Extension.create<{ onPageCount?: (count: number) => void }>({
  name: 'a4Pagination',

  addOptions() {
    return { onPageCount: undefined };
  },

  addProseMirrorPlugins() {
    const onPageCount = this.options.onPageCount;
    return [
      new Plugin({
        key: a4PaginationKey,
        state: {
          init: () => ({ set: DecorationSet.empty, identity: '', pageCount: 1 }),
          apply(tr, current, _old, newState) {
            const meta = tr.getMeta(a4PaginationKey);
            if (meta) return meta;
            if (!tr.docChanged) return current;
            return {
              ...current,
              set: current.set.map(tr.mapping, newState.doc),
            };
          },
        },
        props: {
          decorations(state) {
            return a4PaginationKey.getState(state)?.set || DecorationSet.empty;
          },
        },
        view(view) {
          let raf = 0;
          let resizeTimer: ReturnType<typeof setTimeout> | null = null;
          let destroyed = false;
          const schedule = () => {
            if (destroyed) return;
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
              raf = 0;
              try {
                refreshA4Decorations(view, onPageCount);
              } catch {
                /* layout ainda instável no primeiro frame */
              }
            });
          };
          const onWindowResize = () => {
            if (resizeTimer) clearTimeout(resizeTimer);
            resizeTimer = setTimeout(schedule, 80);
          };
          const onImageLoad = (event: Event) => {
            if (event.target instanceof HTMLImageElement) schedule();
          };
          schedule();
          window.addEventListener('resize', onWindowResize);
          view.dom.addEventListener('load', onImageLoad, true);
          void (document as Document & { fonts?: FontFaceSet }).fonts?.ready?.then(() => {
            if (!destroyed) schedule();
          });
          return {
            update(_view, prevState) {
              if (_view.state.doc.eq(prevState.doc)) return;
              schedule();
            },
            destroy() {
              destroyed = true;
              if (raf) cancelAnimationFrame(raf);
              if (resizeTimer) clearTimeout(resizeTimer);
              window.removeEventListener('resize', onWindowResize);
              view.dom.removeEventListener('load', onImageLoad, true);
            },
          };
        },
      }),
    ];
  },
});
