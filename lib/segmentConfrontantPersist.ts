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

const MANUAL_CONFRONT_FIELDS = [
  'confrontant',
  'confrontante',
  'confrontant_type',
  'confrontant_source',
  'manual_confrontant',
  'manual_confrontant_type',
  'manual_confrontant_source',
  'updated_at',
] as const;

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

function confrontantFromRow(row: Record<string, unknown>): string {
  return String(
    row.manual_confrontant ?? row.confrontant ?? row.confrontante ?? '',
  ).trim();
}

function sourceFromRow(row: Record<string, unknown>): ConfrontantSource {
  const raw = String(
    row.manual_confrontant_source ?? row.confrontant_source ?? 'manual',
  ).trim();
  return (raw || 'manual') as ConfrontantSource;
}

function typeFromRow(
  row: Record<string, unknown>,
): ConfrontantPresetType | string | null {
  const t = row.manual_confrontant_type ?? row.confrontant_type;
  return (t as ConfrontantPresetType | string | null) ?? null;
}

function stripConfrontantFields(row: Record<string, unknown>): Record<string, unknown> {
  const next = { ...row };
  for (const key of MANUAL_CONFRONT_FIELDS) {
    delete next[key];
  }
  return next;
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
  const confrontant = confrontantFromRow(row);
  if (!confrontant || isPendingConfrontantLabel(confrontant)) return null;
  return {
    confrontant,
    confrontant_type: typeFromRow(row),
    confrontant_source: sourceFromRow(row),
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
  const updatedAt = new Date().toISOString();
  return rows.map((row, i) => {
    const idx = segmentIndexFromRow(row, i);
    if (!indexSet.has(idx)) return row;
    const base = {
      ...row,
      segment_index: idx,
      confrontant,
      confrontante: confrontant,
      confrontant_type: confrontantType,
      confrontant_source: source,
      updated_at: updatedAt,
    };
    if (source !== 'manual') return base;
    return {
      ...base,
      manual_confrontant: confrontant,
      manual_confrontant_type: confrontantType,
      manual_confrontant_source: 'manual',
    };
  });
}

export function clearManualConfrontantFromSegmentRows(
  block: Record<string, unknown>,
  segmentIndexes: number[],
): Record<string, unknown>[] {
  const rows = readSegmentsArray(block);
  if (!rows) return [];
  const indexSet = new Set(segmentIndexes);
  return rows.map((row, i) => {
    const idx = segmentIndexFromRow(row, i);
    if (!indexSet.has(idx)) return row;
    const source = sourceFromRow(row);
    const hasManual =
      source === 'manual' ||
      typeof row.manual_confrontant === 'string';
    if (!hasManual) return row;
    return stripConfrontantFields(row);
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
