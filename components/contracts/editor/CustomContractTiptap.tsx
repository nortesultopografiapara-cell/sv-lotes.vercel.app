'use client';

import { useEffect } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import Placeholder from '@tiptap/extension-placeholder';
import { ContractPlaceholder } from '@/components/contracts/editor/ContractPlaceholderNode';
import { FontSize } from '@/components/contracts/editor/FontSizeExtension';
import { PageBreak } from '@/components/contracts/editor/PageBreakNode';
import { hydrateCustomPlaceholderHtml } from '@/lib/customContractHtml';

export type CustomContractTiptapProps = {
  initialHtml: string;
  editable?: boolean;
  onEditor: (editor: Editor | null) => void;
  onChange: (html: string) => void;
};

export default function CustomContractTiptap({
  initialHtml,
  editable = true,
  onEditor,
  onChange,
}: CustomContractTiptapProps) {
  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
        code: false,
      }),
      Underline,
      TextStyle,
      FontSize,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({
        placeholder: 'Escreva o contrato nesta folha A4…',
      }),
      ContractPlaceholder,
      PageBreak,
    ],
    content: hydrateCustomPlaceholderHtml(initialHtml || '<p></p>'),
    editorProps: {
      attributes: {
        class: 'sv-a4-prose',
        spellcheck: 'true',
      },
    },
    onUpdate: ({ editor: current }) => {
      onChange(current.getHTML());
    },
  });

  useEffect(() => {
    onEditor(editor);
    return () => onEditor(null);
  }, [editor, onEditor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  return <EditorContent editor={editor} />;
}
