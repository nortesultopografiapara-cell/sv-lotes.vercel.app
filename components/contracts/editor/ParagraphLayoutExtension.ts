import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphLayout: {
      setParagraphLayout: (attrs: Record<string, string | null>) => ReturnType;
    };
  }
}

function styleAttr(
  key: string,
  cssName: string,
) {
  return {
    default: null as string | null,
    parseHTML: (element: HTMLElement) => {
      const value =
        element.style.getPropertyValue(cssName) ||
        (element.style as CSSStyleDeclaration)[key as keyof CSSStyleDeclaration];
      return value ? String(value) : null;
    },
    renderHTML: (attributes: Record<string, string | null | undefined>) => {
      const value = attributes[key];
      if (!value) return {};
      return { style: `${cssName}:${value}` };
    },
  };
}

export const ParagraphLayout = Extension.create({
  name: 'paragraphLayout',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          lineHeight: styleAttr('lineHeight', 'line-height'),
          marginTop: styleAttr('marginTop', 'margin-top'),
          marginBottom: styleAttr('marginBottom', 'margin-bottom'),
          marginLeft: styleAttr('marginLeft', 'margin-left'),
          marginRight: styleAttr('marginRight', 'margin-right'),
          textIndent: styleAttr('textIndent', 'text-indent'),
        },
      },
    ];
  },

  addCommands() {
    return {
      setParagraphLayout:
        (attrs) =>
        ({ commands, editor }) => {
          const type = editor.isActive('heading') ? 'heading' : 'paragraph';
          return commands.updateAttributes(type, attrs);
        },
    };
  },
});
