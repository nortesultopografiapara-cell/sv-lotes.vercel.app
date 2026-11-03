/**
 * Markdown limitado para o Assistente SV.
 * Permite negrito, itálico, listas, quebras e código inline.
 * Proíbe HTML, scripts, imagens e links clicáveis.
 */

export type AssistantMarkdownNode =
  | { type: 'p'; children: AssistantInlineNode[] }
  | { type: 'ul'; items: AssistantInlineNode[][] }
  | { type: 'ol'; items: AssistantInlineNode[][] };

export type AssistantInlineNode =
  | { type: 'text'; value: string }
  | { type: 'strong'; value: string }
  | { type: 'em'; value: string }
  | { type: 'code'; value: string };

function stripUnsafe(raw: string): string {
  return String(raw || '')
    .replace(/\u0000/g, ' ')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/gi, '[link removido]');
}

function parseInline(text: string): AssistantInlineNode[] {
  const nodes: AssistantInlineNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) {
      nodes.push({ type: 'text', value: text.slice(last, match.index) });
    }
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push({ type: 'strong', value: token.slice(2, -2) });
    } else if (token.startsWith('`')) {
      nodes.push({ type: 'code', value: token.slice(1, -1) });
    } else {
      nodes.push({ type: 'em', value: token.slice(1, -1) });
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push({ type: 'text', value: text.slice(last) });
  return nodes.filter((item) => item.value !== '');
}

export function parseAssistantMarkdown(raw: string): AssistantMarkdownNode[] {
  const text = stripUnsafe(raw).replace(/\r\n/g, '\n').trim();
  if (!text) return [];
  const lines = text.split('\n');
  const nodes: AssistantMarkdownNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const ul = /^\s*[-*]\s+(.+)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (ul || ol) {
      const ordered = Boolean(ol);
      const items: AssistantInlineNode[][] = [];
      while (i < lines.length) {
        const nextUl = /^\s*[-*]\s+(.+)$/.exec(lines[i]);
        const nextOl = /^\s*\d+[.)]\s+(.+)$/.exec(lines[i]);
        const hit = ordered ? nextOl : nextUl;
        if (!hit) break;
        items.push(parseInline(hit[1]));
        i += 1;
      }
      nodes.push({ type: ordered ? 'ol' : 'ul', items });
      continue;
    }
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const para: string[] = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() && !/^\s*(?:[-*]|\d+[.)])\s+/.test(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    nodes.push({ type: 'p', children: parseInline(para.join(' ')) });
  }
  return nodes;
}

export function assistantMarkdownToPlainText(raw: string): string {
  return parseAssistantMarkdown(raw)
    .map((node) => {
      if (node.type === 'p') return node.children.map((item) => item.value).join('');
      return node.items
        .map((item, index) => `${node.type === 'ol' ? `${index + 1}. ` : '• '}${item.map((part) => part.value).join('')}`)
        .join('\n');
    })
    .join('\n');
}
