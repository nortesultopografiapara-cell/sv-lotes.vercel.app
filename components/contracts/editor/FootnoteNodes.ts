import { Node, mergeAttributes } from '@tiptap/core';
import { FOOTNOTE_ID_ATTR, FOOTNOTE_REF_ATTR, FOOTNOTE_STORE_ATTR } from '@/lib/customContractFootnotes';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    contractFootnote: {
      removeFootnoteReference: () => ReturnType;
      removeFootnoteNote: (noteId: string) => ReturnType;
      updateFootnoteBody: (noteId: string, text: string) => ReturnType;
    };
  }
}

export const FootnoteReference = Node.create({
  name: 'footnoteReference',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      noteId: {
        default: '',
        parseHTML: (element) =>
          String(element.getAttribute(FOOTNOTE_REF_ATTR) || element.textContent || '').trim(),
        renderHTML: (attributes) => ({
          [FOOTNOTE_REF_ATTR]: attributes.noteId,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: `sup[${FOOTNOTE_REF_ATTR}]` }, { tag: `a[${FOOTNOTE_REF_ATTR}]` }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const noteId = String(node.attrs.noteId || '');
    return [
      'sup',
      mergeAttributes(HTMLAttributes, {
        [FOOTNOTE_REF_ATTR]: noteId,
        class: 'sv-fn-ref',
      }),
      noteId,
    ];
  },

  addCommands() {
    return {
      removeFootnoteReference:
        () =>
        ({ chain, state }) => {
          const { selection } = state;
          const node = state.doc.nodeAt(selection.from);
          if (node?.type.name !== this.name) return false;
          return chain().deleteSelection().run();
        },
      removeFootnoteNote:
        (noteId: string) =>
        ({ tr, state, dispatch }) => {
          const id = String(noteId || '');
          if (!id) return false;
          const toDelete: Array<{ from: number; to: number }> = [];
          state.doc.descendants((node, pos) => {
            if (node.type.name === 'footnoteReference' && String(node.attrs.noteId) === id) {
              toDelete.push({ from: pos, to: pos + node.nodeSize });
            }
            if (node.type.name === 'footnoteDefinition' && String(node.attrs.noteId) === id) {
              toDelete.push({ from: pos, to: pos + node.nodeSize });
            }
          });
          if (!toDelete.length) return false;
          if (dispatch) {
            toDelete
              .sort((a, b) => b.from - a.from)
              .forEach((range) => tr.delete(range.from, range.to));
            const storePositions: Array<{ from: number; to: number }> = [];
            tr.doc.descendants((node, pos) => {
              if (node.type.name === 'footnoteStore' && node.childCount === 0) {
                storePositions.push({ from: pos, to: pos + node.nodeSize });
              }
            });
            storePositions
              .sort((a, b) => b.from - a.from)
              .forEach((range) => tr.delete(range.from, range.to));
            dispatch(tr);
          }
          return true;
        },
      updateFootnoteBody:
        (noteId: string, text: string) =>
        ({ tr, state, dispatch }) => {
          const id = String(noteId || '');
          if (!id) return false;
          const paragraphs = String(text || '')
            .split(/\n+/)
            .map((line) => line.trim())
            .filter(Boolean);
          let found = false;
          state.doc.descendants((node, pos) => {
            if (node.type.name !== 'footnoteDefinition' || String(node.attrs.noteId) !== id) {
              return;
            }
            found = true;
            const nodes = (paragraphs.length ? paragraphs : ['']).map((line) =>
              state.schema.nodes.paragraph.create(
                null,
                line ? state.schema.text(line) : undefined,
              ),
            );
            tr.replaceWith(pos + 1, pos + node.nodeSize - 1, nodes);
          });
          if (found && dispatch) dispatch(tr);
          return found;
        },
    };
  },
});

export const FootnoteDefinition = Node.create({
  name: 'footnoteDefinition',
  group: 'block',
  content: 'block+',
  isolating: true,
  defining: true,

  addAttributes() {
    return {
      noteId: {
        default: '',
        parseHTML: (element) => String(element.getAttribute(FOOTNOTE_ID_ATTR) || '').trim(),
        renderHTML: (attributes) => ({
          [FOOTNOTE_ID_ATTR]: attributes.noteId,
          'data-sv-footnote-mark': attributes.noteId,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: `aside[${FOOTNOTE_ID_ATTR}]` }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const noteId = String(node.attrs.noteId || '');
    return [
      'aside',
      mergeAttributes(HTMLAttributes, {
        [FOOTNOTE_ID_ATTR]: noteId,
        class: 'sv-footnote',
        'data-sv-footnote-mark': noteId,
      }),
      0,
    ];
  },
});

export const FootnoteStore = Node.create({
  name: 'footnoteStore',
  group: 'block',
  content: 'footnoteDefinition+',
  isolating: true,
  atom: false,

  parseHTML() {
    return [{ tag: `section[${FOOTNOTE_STORE_ATTR}]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'section',
      mergeAttributes(HTMLAttributes, {
        [FOOTNOTE_STORE_ATTR]: 'true',
        class: 'sv-footnote-store',
      }),
      0,
    ];
  },
});
