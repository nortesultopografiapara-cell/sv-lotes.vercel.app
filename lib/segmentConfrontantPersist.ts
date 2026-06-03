/**
 * Confrontantes manuais por segmento em segments_json (prioridade sobre automático).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type ConfrontantPresetType,
  type ConfrontantSource,
  type SegmentConfrontantRecord,
  isPendingConfrontantLabel,
} from '@/lib/confrontantTypes';
import { persistBlockPatch } from '@/lib/blockFrontPersist';

function readSegmentsArray(block: Record<string, unknown>): Record<string, unknown>[] | null {
  const raw = block.segments_json;
  if (Array.isArray(raw) && raw.length >= 2) {
    return raw.map((row) =>
      row != null && typeof row === 'object'
        ? { ...(row as Record<string, unknown>) }
        : {},
    );
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length >= 2) {
        return parsed.map((row) =>
          row != null && typeof row === 'object'
            ? { ...(row as Record<string, unknown>) }
            : {},
        );
      }
    } catch {
      return null;
    }
  }
  return null;
}

export function segmentIndexFromRow(
  row: Record<string, unknown>,
  fallback: number,
): number {
  return typeof row.segment_index === 'number'
    ? row.segment_index
    : fallback;
}

export function getSegmentConfrontantRecord(
  block: Record<string, unknown>,
  segmentIndex: number,
): SegmentConfrontantRecord | null {
  const rows = readSegmentsArray(block);
  if (!rows) return null;
  const row = rows.find(
    (r, i) => segmentIndexFromRow(r, i) === segmentIndex,
  );
  if (!row) return null;
  const confrontant = String(
    row.confrontant ?? row.confrontante ?? '',
  ).trim();
  if (!confrontant || isPendingConfrontantLabel(confrontant)) return null;
  const source = String(row.confrontant_source ?? 'manual').trim() as ConfrontantSource;
  const confrontant_type = row.confrontant_type as ConfrontantPresetType | string | null;
  return {
    confrontant,
    confrontant_type: confrontant_type ?? null,
    confrontant_source: source || 'manual',
  };
}

export function applyConfrontantToSegmentRows(
  block: Record<string, unknown>,
  segmentIndexes: number[],
  confrontant: string,
  confrontantType: ConfrontantPresetType | string | null,
  source: ConfrontantSource = 'manual',
): Record<string, unknown>[] {
  const rows = readSegmentsArray(block);
  if (!rows) return [];
  const indexSet = new Set(segmentIndexes);
  return rows.map((row, i) => {
    const idx = segmentIndexFromRow(row, i);
    if (!indexSet.has(idx)) return row;
    return {
      ...row,
      segment_index: idx,
      confrontant,
      confrontante: confrontant,
      confrontant_type: confrontantType,
      confrontant_source: source,
    };
  });
}

export function blockWithUpdatedSegmentsJson(
  block: Record<string, unknown>,
  segmentsJson: Record<string, unknown>[],
): Record<string, unknown> {
  return { ...block, segments_json: segmentsJson };
}

export async function persistBlockSegmentsJson(
  supabase: SupabaseClient,
  blockId: string,
  segmentsJson: Record<string, unknown>[],
): Promise<void> {
  await persistBlockPatch(supabase, blockId, { segments_json: segmentsJson });
}
