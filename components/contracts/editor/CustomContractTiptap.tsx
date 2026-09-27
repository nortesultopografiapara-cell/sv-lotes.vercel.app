'use client';

import { useEffect, useRef } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { ContractPlaceholder } from '@/components/contracts/editor/ContractPlaceholderNode';
import { FontSize } from '@/components/contracts/editor/FontSizeExtension';
import { PageBreak } from '@/components/contracts/editor/PageBreakNode';
import { hydrateCustomPlaceholderHtml } from '@/lib/customContractHtml';

export type CustomContractTiptapProps = {
  initialHtml: string;
  contentKey?: string;
  editable?: boolean;
  onEditor: (editor: Editor | null) => void;
  onChange: (html: string) => void;
};

export default function CustomContractTiptap({
  initialHtml,
  contentKey,
  editable = true,
  onEditor,
  onChange,
}: CustomContractTiptapProps) {
  const skipNext = useRef(true);
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
      Image.configure({ inline: false, allowBase64: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
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
      if (skipNext.current) {
        skipNext.current = false;
        return;
      }
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

  useEffect(() => {
    if (!editor || !initialHtml) return;
    skipNext.current = true;
    editor.commands.setContent(hydrateCustomPlaceholderHtml(initialHtml), false);
  }, [editor, contentKey]);

  return <EditorContent editor={editor} />;
}
