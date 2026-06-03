/**
 * Memorial descritivo — compatibilidade e texto rápido.
 */

import { buildMemorialDescriptionText } from '@/lib/memorial/memorialText';
import { buildMemorialSegments } from '@/lib/memorial/memorialGeometry';
import type { MemorialDraftInput } from '@/lib/memorial/memorialTypes';

export type { MemorialDraftInput };

/** Texto narrativo completo (MEM-001). */
export function buildMemorialDraftPlainText(
  input: MemorialDraftInput,
): string {
  const block = input.block;
  const blockId = String(block.id || '');
  const segments = buildMemorialSegments(
    block,
    blockId,
    input.projectBlocks || [],
    (input.streetGuides || []) as import('@/lib/streetGuideConfrontation').StreetGuideConfrontInput[],
  );
  if (!segments.length) {
    return 'Memorial indisponível: sem segmentos oficiais válidos.';
  }
  return buildMemorialDescriptionText(segments);
}
