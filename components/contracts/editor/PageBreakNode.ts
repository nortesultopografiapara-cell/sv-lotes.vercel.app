import { Node, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageBreak: {
      insertPageBreak: () => ReturnType;
    };
  }
}

export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-sv-page-break]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-sv-page-break': 'true',
        class: 'sv-page-break',
        style: 'page-break-after:always;break-after:page',
      }),
    ];
  },

  addCommands() {
    return {
      insertPageBreak:
        () =>
        ({ chain }) =>
          chain().focus().insertContent({ type: this.name }).run(),
    };
  },
});
