import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';
import {
  CUSTOM_A4_GAP_PX,
  collectA4UnitsFromElement,
  customA4PageInnerPx,
  measureFootnoteClusterHeight,
  planA4Pages,
} from '@/lib/customContractA4Layout';

const a4PaginationKey = new PluginKey('svCustomA4Pagination');

function spacerWidget(height: number, isRow: boolean, colCount: number) {
  return () => {
    if (isRow) {
      const tr = document.createElement('tr');
      tr.className = 'sv-a4-flow-gap-row';
      tr.setAttribute('contenteditable', 'false');
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

function planHash(
  pages: Array<{ start: number; leftover: number; footnoteIds: string[]; footnoteHeight: number }>,
): string {
  return pages
    .map(
      (page) =>
        `${page.start}:${page.leftover}:${page.footnoteHeight}:${page.footnoteIds.join(',')}`,
    )
    .join('|');
}

function posFor(view: EditorView, el: HTMLElement, atEnd: boolean): number {
  try {
    return view.posAtDOM(el, atEnd ? el.childNodes.length : 0);
  } catch {
    return -1;
  }
}

function refreshA4Decorations(view: EditorView, onPageCount?: (count: number) => void) {
  const pageInner = customA4PageInnerPx();
  const collected = collectA4UnitsFromElement(view.dom as HTMLElement, pageInner);
  const store = view.dom.querySelector('[data-sv-footnote-store], .sv-footnote-store') as HTMLElement | null;
  const pages = planA4Pages(collected, pageInner, CUSTOM_A4_GAP_PX, (ids) =>
    measureFootnoteClusterHeight(store, ids),
  );
  const hash = planHash(pages);
  const prevHash = a4PaginationKey.getState(view.state)?.hash;
  const pageCount = Math.max(1, pages.length);
  if (hash === prevHash) {
    onPageCount?.(pageCount);
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
      const spacerHeight = Math.max(1, page.leftover - page.footnoteHeight + CUSTOM_A4_GAP_PX);
      const pos = posFor(view, next.el, false);
      if (pos >= 0) {
        decorations.push(
          Decoration.widget(
            pos,
            spacerWidget(spacerHeight, next.el.tagName.toLowerCase() === 'tr', next.el.children.length),
            {
              side: -1,
              ignoreSelection: true,
              key: `a4-${pos}-${spacerHeight}`,
            },
          ),
        );
      }
    }
  }

  const nextSet = DecorationSet.create(view.state.doc, decorations);
  const tr = view.state.tr
    .setMeta(a4PaginationKey, { set: nextSet, hash, pageCount })
    .setMeta('addToHistory', false);
  view.dispatch(tr);
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
          init: () => ({ set: DecorationSet.empty, hash: '', pageCount: 1 }),
          apply(tr, current, _old, newState) {
            const meta = tr.getMeta(a4PaginationKey);
            if (meta) return meta;
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
          let timer: ReturnType<typeof setTimeout> | null = null;
          let observer: ResizeObserver | null = null;
          const schedule = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
              try {
                refreshA4Decorations(view, onPageCount);
              } catch {
                /* layout ainda instável */
              }
            }, 40);
          };
          schedule();
          if (typeof ResizeObserver !== 'undefined') {
            observer = new ResizeObserver(() => schedule());
            observer.observe(view.dom);
          }
          return {
            update: schedule,
            destroy() {
              if (timer) clearTimeout(timer);
              observer?.disconnect();
            },
          };
        },
      }),
    ];
  },
});
