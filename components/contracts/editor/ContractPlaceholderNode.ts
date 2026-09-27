import { InputRule, Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import PlaceholderChip from '@/components/contracts/editor/PlaceholderChip';
import { CUSTOM_PLACEHOLDER_KEYS, customPlaceholderToken } from '@/lib/customContractPlaceholders';
import { CUSTOM_COMPANY_LOGO_DEFAULTS } from '@/lib/customContractLogo';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    contractPlaceholder: {
      insertContractPlaceholder: (key: string) => ReturnType;
      replaceSelectionWithPlaceholder: (key: string) => ReturnType;
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
    return [
      {
        tag: 'span[data-sv-placeholder]',
        getAttrs: (element) => {
          const key = String(
            (element as HTMLElement).getAttribute('data-sv-placeholder') || '',
          )
            .trim()
            .toUpperCase();
          if (!key || key === 'COMPANY_LOGO_URL') return false;
          return { key };
        },
      },
    ];
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
          if (normalized === 'COMPANY_LOGO_URL') {
            return chain()
              .focus()
              .insertContent({ type: 'companyLogo', attrs: CUSTOM_COMPANY_LOGO_DEFAULTS })
              .run();
          }
          return chain()
            .focus()
            .insertContent({
              type: this.name,
              attrs: { key: normalized },
            })
            .run();
        },
      replaceSelectionWithPlaceholder:
        (key: string) =>
        ({ chain, state }) => {
          const normalized = String(key || '')
            .trim()
            .toUpperCase();
          if (!CUSTOM_PLACEHOLDER_KEYS.has(normalized)) return false;
          const { from, to } = state.selection;
          const command = chain().focus();
          if (from !== to) command.deleteSelection();
          if (normalized === 'COMPANY_LOGO_URL') {
            return command
              .insertContent({ type: 'companyLogo', attrs: CUSTOM_COMPANY_LOGO_DEFAULTS })
              .run();
          }
          return command
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
          if (key === 'COMPANY_LOGO_URL') {
            chain()
              .deleteRange(range)
              .insertContent({ type: 'companyLogo', attrs: CUSTOM_COMPANY_LOGO_DEFAULTS })
              .run();
            return;
          }
          chain()
            .deleteRange(range)
            .insertContent({ type: this.name, attrs: { key } })
            .run();
        },
      }),
    ];
  },
});
