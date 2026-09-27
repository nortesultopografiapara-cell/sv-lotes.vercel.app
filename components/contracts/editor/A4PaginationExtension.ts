import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';
import {
  CUSTOM_A4_GAP_PX,
  collectA4UnitsFromElement,
  countPagesFromA4Plan,
  customA4PageInnerPx,
  planA4BlockSpacers,
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

function planHash(plan: Array<{ beforeUnitId: string; height: number }>): string {
  return plan.map((row) => `${row.beforeUnitId}:${row.height}`).join('|');
}

function refreshA4Decorations(view: EditorView, onPageCount?: (count: number) => void) {
  const pageInner = customA4PageInnerPx();
  const collected = collectA4UnitsFromElement(view.dom as HTMLElement, pageInner);
  const plan = planA4BlockSpacers(collected, pageInner, CUSTOM_A4_GAP_PX);
  const hash = planHash(plan);
  const prevHash = a4PaginationKey.getState(view.state)?.hash;
  const pageCount = countPagesFromA4Plan(collected, plan);
  if (hash === prevHash) {
    onPageCount?.(pageCount);
    return;
  }

  const decorations: Decoration[] = [];
  for (const item of plan) {
    const unit = collected.find((row) => row.id === item.beforeUnitId);
    if (!unit?.el) continue;
    let pos = -1;
    try {
      pos = view.posAtDOM(unit.el, 0);
    } catch {
      pos = -1;
    }
    if (pos < 0) continue;
    const isRow = unit.el.tagName.toLowerCase() === 'tr';
    decorations.push(
      Decoration.widget(pos, spacerWidget(item.height, isRow, unit.el.children.length), {
        side: -1,
        ignoreSelection: true,
        key: `a4-${pos}-${item.height}`,
      }),
    );
  }

  const next = DecorationSet.create(view.state.doc, decorations);
  const tr = view.state.tr
    .setMeta(a4PaginationKey, { set: next, hash, pageCount })
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
