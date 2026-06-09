/**
 * Persistência de official_side por segmento em segments_json.
 * Não altera área, confrontações nem campos legados de medida.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  normalizeOfficialSideKind,
  officialSideDisplayLabel,
  type OfficialSideKind,
} from '@/lib/officialLotMeasurements';
import {
  persistBlockSegmentsJson,
  segmentIndexFromRow,
} from '@/lib/segmentConfrontantPersist';

function readSegmentsArray(
  block: Record<string, unknown>,
): Record<string, unknown>[] | null {
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

function stripOfficialSideFields(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...row };
  delete next.official_side;
  delete next.officialSide;
  return next;
}

export function readOfficialSideFromSegmentRow(
  row: Record<string, unknown>,
): OfficialSideKind | null {
  return normalizeOfficialSideKind(row.official_side ?? row.officialSide);
}

export function getSegmentDistanceFromBlock(
  block: Record<string, unknown>,
  segmentIndex: number,
): number | null {
  const rows = readSegmentsArray(block);
  if (!rows) return null;
  const row = rows.find((r, i) => segmentIndexFromRow(r, i) === segmentIndex);
  if (!row) return null;
  const d = Number(row.distance);
  return Number.isFinite(d) && d > 0 ? d : null;
}

export function applyOfficialSideToSegmentRows(
  block: Record<string, unknown>,
  segmentIndex: number,
  side: OfficialSideKind,
): Record<string, unknown>[] {
  const rows = readSegmentsArray(block);
  if (!rows) return [];
  const updatedAt = new Date().toISOString();
  return rows.map((row, i) => {
    const idx = segmentIndexFromRow(row, i);
    if (idx !== segmentIndex) return row;
    return {
      ...row,
      segment_index: idx,
      official_side: side,
      updated_at: updatedAt,
    };
  });
}

export function clearOfficialSideFromSegmentRows(
  block: Record<string, unknown>,
  segmentIndex: number,
): Record<string, unknown>[] {
  const rows = readSegmentsArray(block);
  if (!rows) return [];
  return rows.map((row, i) => {
    const idx = segmentIndexFromRow(row, i);
    if (idx !== segmentIndex) return row;
    const hasSide = Boolean(
      normalizeOfficialSideKind(row.official_side ?? row.officialSide),
    );
    if (!hasSide) return row;
    return stripOfficialSideFields(row);
  });
}

export function blockWithUpdatedOfficialSide(
  block: Record<string, unknown>,
  segmentIndex: number,
  side: OfficialSideKind | null,
): Record<string, unknown> {
  const rows =
    side == null
      ? clearOfficialSideFromSegmentRows(block, segmentIndex)
      : applyOfficialSideToSegmentRows(block, segmentIndex, side);
  return { ...block, segments_json: rows };
}

export function officialSideAuditDescription(
  segmentIndex: number,
  side: OfficialSideKind | null,
): string {
  const segLabel = segmentIndex + 1;
  if (side == null) {
    return `Segmento ${segLabel}: lado oficial removido (automático)`;
  }
  const label = officialSideDisplayLabel(side) ?? side;
  return `Segmento ${segLabel} definido como ${label}`;
}

export async function persistOfficialSideForSegment(
  supabase: SupabaseClient,
  blockId: string,
  block: Record<string, unknown>,
  segmentIndex: number,
  side: OfficialSideKind | null,
): Promise<Record<string, unknown>[]> {
  const rows =
    side == null
      ? clearOfficialSideFromSegmentRows(block, segmentIndex)
      : applyOfficialSideToSegmentRows(block, segmentIndex, side);
  await persistBlockSegmentsJson(supabase, blockId, rows);
  return rows;
}
