/**
 * Aplica confrontante de rua na frente em segments_json (confrontação automática).
 * Não grava front_street_name no block — só segmentos oficiais da frente.
 */

import { officialSegmentIndexesForSide } from '@/lib/assistedConfrontation';
import type { ConfrontantSource } from '@/lib/confrontantTypes';
import type { StreetGuideConfrontInput } from '@/lib/streetGuideConfrontation';
import {
  applyConfrontantToSegmentRows,
  blockWithUpdatedSegmentsJson,
  getSegmentConfrontantRecord,
} from '@/lib/segmentConfrontantPersist';

export function applyAutoFrontStreetToBlockSegments(
  block: Record<string, unknown>,
  frontLabel: string,
  source: ConfrontantSource,
  allBlocks: Record<string, unknown>[],
  project?: Record<string, unknown> | null,
  streetGuides: StreetGuideConfrontInput[] = [],
): Record<string, unknown> {
  const label = String(frontLabel || '').trim();
  if (!label || source !== 'street_guide') return block;

  const indexes = officialSegmentIndexesForSide(
    block,
    allBlocks,
    'frente',
    project,
    streetGuides,
  );
  if (!indexes.length) return block;

  for (const idx of indexes) {
    const rec = getSegmentConfrontantRecord(block, idx);
    if (rec?.confrontant_source === 'manual') return block;
  }

  const rows = applyConfrontantToSegmentRows(
    block,
    indexes,
    label,
    'street',
    'street_guide',
  );
  return blockWithUpdatedSegmentsJson(block, rows);
}
