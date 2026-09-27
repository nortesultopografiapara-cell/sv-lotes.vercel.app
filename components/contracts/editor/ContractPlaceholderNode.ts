import { InputRule, Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import PlaceholderChip from '@/components/contracts/editor/PlaceholderChip';
import { CUSTOM_PLACEHOLDER_KEYS, customPlaceholderToken } from '@/lib/customContractPlaceholders';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    contractPlaceholder: {
      insertContractPlaceholder: (key: string) => ReturnType;
    };
  }
}

export const ContractPlaceholder = Node.create({
  name: 'contractPlaceholder',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      key: {
        default: null,
        parseHTML: (element) =>
          String(element.getAttribute('data-sv-placeholder') || '')
            .trim()
            .toUpperCase(),
        renderHTML: (attributes) => ({
          'data-sv-placeholder': attributes.key,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-sv-placeholder]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const key = String(node.attrs.key || '').toUpperCase();
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-sv-placeholder': key,
        class: 'sv-contract-placeholder',
        contenteditable: 'false',
      }),
      customPlaceholderToken(key),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PlaceholderChip);
  },

  addCommands() {
    return {
      insertContractPlaceholder:
        (key: string) =>
        ({ chain }) => {
          const normalized = String(key || '')
            .trim()
            .toUpperCase();
          if (!CUSTOM_PLACEHOLDER_KEYS.has(normalized)) return false;
          return chain()
            .focus()
            .insertContent({
              type: this.name,
              attrs: { key: normalized },
            })
            .run();
        },
    };
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\{\{([A-Z0-9_]{3,})\}\}$/,
        handler: ({ range, match, chain }) => {
          const key = String(match[1] || '').toUpperCase();
          if (!CUSTOM_PLACEHOLDER_KEYS.has(key)) return;
          chain()
            .deleteRange(range)
            .insertContent({ type: this.name, attrs: { key } })
            .run();
        },
      }),
    ];
  },
});
