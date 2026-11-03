'use client';

import { parseAssistantMarkdown, type AssistantInlineNode } from '@/lib/assistant/safeMarkdown';

function Inline({ nodes }: { nodes: AssistantInlineNode[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        if (node.type === 'strong') return <strong key={index}>{node.value}</strong>;
        if (node.type === 'em') return <em key={index}>{node.value}</em>;
        if (node.type === 'code') {
          return (
            <code key={index} className="sv-assistant-code">
              {node.value}
            </code>
          );
        }
        return <span key={index}>{node.value}</span>;
      })}
    </>
  );
}

export function AssistantSafeMarkdown({ text }: { text: string }) {
  const nodes = parseAssistantMarkdown(text);
  if (nodes.length === 0) return null;
  return (
    <div className="sv-assistant-md">
      {nodes.map((node, index) => {
        if (node.type === 'ul' || node.type === 'ol') {
          const List = node.type === 'ol' ? 'ol' : 'ul';
          return (
            <List key={index} className="sv-assistant-md-list">
              {node.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <Inline nodes={item} />
                </li>
              ))}
            </List>
          );
        }
        return (
          <p key={index} className="sv-assistant-md-p">
            <Inline nodes={node.children} />
          </p>
        );
      })}
    </div>
  );
}
