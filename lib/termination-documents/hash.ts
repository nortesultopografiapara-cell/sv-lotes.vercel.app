import { createHash } from 'node:crypto';

export function hashTerminationDocumentHtml(html: string): string {
  return createHash('sha256').update(String(html || ''), 'utf8').digest('hex');
}

export function assertFrozenHtmlUnchanged(
  frozenHtml: string,
  expectedHash: string,
): void {
  const actual = hashTerminationDocumentHtml(frozenHtml);
  if (actual !== expectedHash) {
    throw new Error('TERMINATION_DOCUMENT_HASH_MISMATCH');
  }
}
