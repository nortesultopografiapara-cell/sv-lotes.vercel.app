import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import CompanyLogoView from '@/components/contracts/editor/CompanyLogoView';
import {
  COMPANY_LOGO_KEY,
  COMPANY_LOGO_TOKEN,
  CUSTOM_COMPANY_LOGO_DEFAULTS,
  companyLogoBlockStyle,
  normalizeCompanyLogoAlign,
  normalizeCompanyLogoLayout,
  normalizeCompanyLogoSpacing,
  normalizeCompanyLogoWidth,
  type CompanyLogoAlign,
} from '@/lib/customContractLogo';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    companyLogo: {
      insertCompanyLogo: () => ReturnType;
      updateCompanyLogoLayout: (
        attrs: Partial<{
          align: CompanyLogoAlign;
          width: number;
          marginBefore: number;
          marginAfter: number;
        }>,
      ) => ReturnType;
    };
  }
}

export const CompanyLogo = Node.create({
  name: 'companyLogo',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      align: {
        default: CUSTOM_COMPANY_LOGO_DEFAULTS.align,
        parseHTML: (element) =>
          normalizeCompanyLogoAlign(
            element.getAttribute('data-align') || (element as HTMLElement).style?.textAlign,
          ),
        renderHTML: (attributes) => ({ 'data-align': attributes.align }),
      },
      width: {
        default: CUSTOM_COMPANY_LOGO_DEFAULTS.width,
        parseHTML: (element) => normalizeCompanyLogoWidth(element.getAttribute('data-width')),
        renderHTML: (attributes) => ({ 'data-width': String(attributes.width) }),
      },
      marginBefore: {
        default: CUSTOM_COMPANY_LOGO_DEFAULTS.marginBefore,
        parseHTML: (element) =>
          normalizeCompanyLogoSpacing(element.getAttribute('data-margin-before')),
        renderHTML: (attributes) => ({ 'data-margin-before': String(attributes.marginBefore) }),
      },
      marginAfter: {
        default: CUSTOM_COMPANY_LOGO_DEFAULTS.marginAfter,
        parseHTML: (element) =>
          normalizeCompanyLogoSpacing(element.getAttribute('data-margin-after')),
        renderHTML: (attributes) => ({ 'data-margin-after': String(attributes.marginAfter) }),
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'div[data-sv-company-logo]' },
      { tag: `div[data-sv-placeholder="${COMPANY_LOGO_KEY}"]` },
      { tag: `span[data-sv-placeholder="${COMPANY_LOGO_KEY}"]` },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const layout = normalizeCompanyLogoLayout({
      align: node.attrs.align,
      width: node.attrs.width,
      marginBefore: node.attrs.marginBefore,
      marginAfter: node.attrs.marginAfter,
    });
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-sv-placeholder': COMPANY_LOGO_KEY,
        'data-sv-company-logo': 'true',
        class: 'sv-company-logo',
        style: companyLogoBlockStyle(layout),
      }),
      COMPANY_LOGO_TOKEN,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CompanyLogoView);
  },

  addCommands() {
    return {
      insertCompanyLogo:
        () =>
        ({ chain }) =>
          chain()
            .focus()
            .insertContent({
              type: this.name,
              attrs: CUSTOM_COMPANY_LOGO_DEFAULTS,
            })
            .run(),
      updateCompanyLogoLayout:
        (attrs) =>
        ({ chain }) =>
          chain()
            .focus()
            .updateAttributes(this.name, attrs)
            .run(),
    };
  },
});
