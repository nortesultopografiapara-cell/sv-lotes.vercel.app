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
import { A4Pagination } from '@/components/contracts/editor/A4PaginationExtension';
import { CompanyLogo } from '@/components/contracts/editor/CompanyLogoNode';
import { CompanyLogoContext } from '@/components/contracts/editor/CompanyLogoContext';
import { ContractPlaceholder } from '@/components/contracts/editor/ContractPlaceholderNode';
import { FontSize } from '@/components/contracts/editor/FontSizeExtension';
import { PageBreak } from '@/components/contracts/editor/PageBreakNode';
import { hydrateCustomPlaceholderHtml } from '@/lib/customContractHtml';

export type CustomContractTiptapProps = {
  initialHtml: string;
  contentKey?: string;
  editable?: boolean;
  companyLogoUrl?: string | null;
  onEditor: (editor: Editor | null) => void;
  onChange: (html: string) => void;
  onPageCount?: (count: number) => void;
  onSelection?: () => void;
};

export default function CustomContractTiptap({
  initialHtml,
  contentKey,
  editable = true,
  companyLogoUrl = null,
  onEditor,
  onChange,
  onPageCount,
  onSelection,
}: CustomContractTiptapProps) {
  const skipNext = useRef(true);
  const pageCountRef = useRef(onPageCount);
  pageCountRef.current = onPageCount;

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
      CompanyLogo,
      PageBreak,
      A4Pagination.configure({
        onPageCount: (count) => pageCountRef.current?.(count),
      }),
    ],
    content: hydrateCustomPlaceholderHtml(initialHtml || '<p></p>'),
    editorProps: {
      attributes: {
        class: 'sv-a4-prose',
        spellcheck: 'true',
      },
    },
    onUpdate: ({ editor: current, transaction }) => {
      if (transaction && !transaction.docChanged) return;
      if (skipNext.current) {
        skipNext.current = false;
        return;
      }
      onChange(current.getHTML());
    },
    onSelectionUpdate: () => {
      onSelection?.();
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

  return (
    <CompanyLogoContext.Provider value={{ url: companyLogoUrl || null }}>
      <EditorContent editor={editor} />
    </CompanyLogoContext.Provider>
  );
}
