/**
 * Persistência e validação de official_side em segments_json.
 * Não altera heurística global — só o campo manual por segmento.
 */

import {
  getOfficialLotMeasurements,
  normalizeOfficialSideKind,
  parseOfficialSegmentsFromBlock,
  readManualOfficialSideMap,
  stripManualOfficialSidesFromBlock,
  type OfficialSideKind,
} from '@/lib/officialLotMeasurements';
import { resolveContractLotSides } from '@/lib/contractLotBoundaries';

export type OfficialSideDraftMap = Map<number, OfficialSideKind>;

export type OfficialSideValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  coverage: { covered: number; total: number };
  orphans: number[];
  duplicates: number[];
  indexes: {
    front: number[];
    back: number[];
    right: number[];
    left: number[];
  };
  totals: {
    frente: number;
    fundo: number;
    ladoDireito: number;
    ladoEsquerdo: number;
    perimeter: number;
    sidesSum: number;
  };
  contractMatches: boolean;
  onlyOfficialSideDiff: boolean;
};

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

function segmentIndexFromRow(
  row: Record<string, unknown>,
  fallback: number,
): number {
  return typeof row.segment_index === 'number' ? row.segment_index : fallback;
}

export function draftMapFromBlock(
  block: Record<string, unknown>,
): OfficialSideDraftMap {
  return new Map(readManualOfficialSideMap(block));
}

export function applyOfficialSideDraftToBlock(
  block: Record<string, unknown>,
  draft: OfficialSideDraftMap,
): Record<string, unknown> {
  const rows = readSegmentsArray(block);
  if (!rows) return block;
  const next = rows.map((row, i) => {
    const idx = segmentIndexFromRow(row, i);
    const side = draft.get(idx);
    const out: Record<string, unknown> = { ...row, segment_index: idx };
    delete out.officialSide;
    if (!side) {
      delete out.official_side;
      return out;
    }
    out.official_side = side;
    return out;
  });
  return { ...block, segments_json: next };
}

export function onlyOfficialSideFieldsChanged(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): boolean {
  const a = readSegmentsArray(before);
  const b = readSegmentsArray(after);
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = { ...a[i] };
    const right = { ...b[i] };
    delete (left as { official_side?: unknown }).official_side;
    delete (left as { officialSide?: unknown }).officialSide;
    delete (right as { official_side?: unknown }).official_side;
    delete (right as { officialSide?: unknown }).officialSide;
    if (JSON.stringify(left) !== JSON.stringify(right)) return false;
  }
  return true;
}

export function validateOfficialSideDraft(
  block: Record<string, unknown>,
  draft: OfficialSideDraftMap,
  options?: { perimeterTolerance?: number },
): OfficialSideValidation {
  const tol = options?.perimeterTolerance ?? 0.5;
  const errors: string[] = [];
  const warnings: string[] = [];
  const segments = parseOfficialSegmentsFromBlock(block);
  const total = segments.length;
  const indexes = {
    front: [] as number[],
    back: [] as number[],
    right: [] as number[],
    left: [] as number[],
  };
  const seen = new Map<number, OfficialSideKind>();
  const duplicates: number[] = [];

  for (const [idx, side] of draft) {
    if (seen.has(idx)) {
      duplicates.push(idx);
      continue;
    }
    seen.set(idx, side);
    if (side === 'front') indexes.front.push(idx);
    else if (side === 'back') indexes.back.push(idx);
    else if (side === 'right') indexes.right.push(idx);
    else if (side === 'left') indexes.left.push(idx);
    else if (side === 'chanfre') {
      warnings.push(`Seg. ${idx + 1}: chanfre não entra nos totais oficiais`);
    }
  }
  for (const key of Object.keys(indexes) as (keyof typeof indexes)[]) {
    indexes[key].sort((a, b) => a - b);
  }

  const orphans = segments
    .map((s) => s.segment_index)
    .filter((idx) => !seen.has(idx));

  if (orphans.length) {
    errors.push(
      `Segmentos sem classificação: ${orphans.map((i) => i + 1).join(', ')}`,
    );
  }
  if (duplicates.length) {
    errors.push(
      `Segmentos duplicados: ${duplicates.map((i) => i + 1).join(', ')}`,
    );
  }
  if (seen.size !== total && orphans.length === 0 && duplicates.length === 0) {
    // indices fora do anel
    for (const idx of seen.keys()) {
      if (!segments.some((s) => s.segment_index === idx)) {
        errors.push(`Índice inválido: ${idx}`);
      }
    }
  }

  const patched = applyOfficialSideDraftToBlock(block, draft);
  const measures = getOfficialLotMeasurements(patched, patched.number);
  const contract = resolveContractLotSides(patched);
  const perimeter = segments.reduce((sum, s) => {
    const d = Number(s.distance);
    return Number.isFinite(d) && d > 0 ? sum + d : sum;
  }, 0);
  const sidesSum =
    Number(measures.frente ?? 0) +
    Number(measures.fundo ?? 0) +
    Number(measures.ladoDireito ?? 0) +
    Number(measures.ladoEsquerdo ?? 0);

  if (Math.abs(sidesSum - perimeter) > tol) {
    errors.push(
      `Soma dos lados (${sidesSum.toFixed(2)}) ≠ perímetro (${perimeter.toFixed(2)})`,
    );
  }

  const contractMatches =
    Math.abs(Number(contract.frente) - Number(measures.frente ?? 0)) <= tol &&
    Math.abs(Number(contract.fundo) - Number(measures.fundo ?? 0)) <= tol &&
    Math.abs(Number(contract.ladoDireito) - Number(measures.ladoDireito ?? 0)) <=
      tol &&
    Math.abs(
      Number(contract.ladoEsquerdo) - Number(measures.ladoEsquerdo ?? 0),
    ) <= tol;

  if (!contractMatches) {
    errors.push('Totais do modal ≠ resolveContractLotSides');
  }

  // Conferir indexes da medição vs draft (quando cobertura completa)
  if (orphans.length === 0 && duplicates.length === 0) {
    const eq = (a: number[], b: number[]) =>
      JSON.stringify([...a].sort((x, y) => x - y)) ===
      JSON.stringify([...b].sort((x, y) => x - y));
    if (
      !eq(indexes.front, measures.sides?.front.segmentIndexes ?? []) ||
      !eq(indexes.back, measures.sides?.back.segmentIndexes ?? []) ||
      !eq(indexes.right, measures.sides?.right.segmentIndexes ?? []) ||
      !eq(indexes.left, measures.sides?.left.segmentIndexes ?? [])
    ) {
      warnings.push(
        'Prévia de índices diverge ligeiramente da medição oficial (verifique outlier de frente).',
      );
    }
  }

  const onlyOfficialSideDiff = onlyOfficialSideFieldsChanged(block, patched);

  // front seed warning
  const frontSeed = Number(block.front_segment_index);
  if (
    Number.isFinite(frontSeed) &&
    indexes.front.length > 0 &&
    !indexes.front.includes(frontSeed)
  ) {
    warnings.push(
      `front_segment_index (${frontSeed + 1}) não está na Frente manual`,
    );
  }

  return {
    ok: errors.length === 0 && total >= 3 && onlyOfficialSideDiff,
    errors,
    warnings,
    coverage: { covered: seen.size, total },
    orphans,
    duplicates,
    indexes,
    totals: {
      frente: Number(measures.frente ?? 0),
      fundo: Number(measures.fundo ?? 0),
      ladoDireito: Number(measures.ladoDireito ?? 0),
      ladoEsquerdo: Number(measures.ladoEsquerdo ?? 0),
      perimeter: Math.round(perimeter * 100) / 100,
      sidesSum: Math.round(sidesSum * 100) / 100,
    },
    contractMatches,
    onlyOfficialSideDiff,
  };
}

export function previewOfficialSideDraft(
  block: Record<string, unknown>,
  draft: OfficialSideDraftMap,
) {
  const patched = applyOfficialSideDraftToBlock(block, draft);
  const measures = getOfficialLotMeasurements(patched, patched.number);
  const contract = resolveContractLotSides(patched);
  const validation = validateOfficialSideDraft(block, draft);
  return { patched, measures, contract, validation };
}

export function setDraftSides(
  draft: OfficialSideDraftMap,
  indexes: number[],
  side: OfficialSideKind | null,
): OfficialSideDraftMap {
  const next = new Map(draft);
  for (const idx of indexes) {
    if (side == null) next.delete(idx);
    else next.set(idx, side);
  }
  return next;
}

export function snapshotSegmentsJson(
  block: Record<string, unknown>,
): Record<string, unknown>[] | null {
  return readSegmentsArray(block);
}

export function restoreAutomaticOfficialSides(
  block: Record<string, unknown>,
): Record<string, unknown> {
  return stripManualOfficialSidesFromBlock(block);
}

export function normalizeDraftSideInput(
  raw: unknown,
): OfficialSideKind | null {
  return normalizeOfficialSideKind(raw);
}

export const OFFICIAL_SIDE_EDITOR_ROLES = ['ADMIN', 'SUPER_ADMIN'] as const;

export function canEditOfficialSides(role: string | null | undefined): boolean {
  const r = String(role ?? '').toUpperCase();
  return (
    r === 'ADMIN' ||
    r === 'SUPER_ADMIN' ||
    r === 'ADMINISTRADOR'
  );
}
