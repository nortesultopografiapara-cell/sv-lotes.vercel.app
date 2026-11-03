'use client';

import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { customPlaceholderLabel, customPlaceholderToken } from '@/lib/customContractPlaceholders';

export default function PlaceholderChip({ node }: NodeViewProps) {
  const key = String(node.attrs.key || '');
  return (
    <NodeViewWrapper
      as="span"
      className="sv-ph-chip"
      data-sv-placeholder={key}
      title={customPlaceholderToken(key)}
    >
      {customPlaceholderLabel(key)}
    </NodeViewWrapper>
  );
}
