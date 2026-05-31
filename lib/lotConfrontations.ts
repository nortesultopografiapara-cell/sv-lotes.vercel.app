/**
 * Confrontações do lote (frente/fundo/laterais) — automático + correção manual (local).
 */

import { getOfficialConfrontationRing } from '@/lib/officialConfrontationRing';
import { buildSideConfrontantsFromSegments } from '@/lib/lotSegmentConfrontation';
import {
  buildSideConfrontants,
  latLngRingFromBlock,
  type LotSheetSideConfrontants,
} from '@/lib/lotSheetEnrichment';
import { getProjectLotConfrontants } from "@/lib/projectConfrontations";

export type ManualSideConfrontants = Partial<LotSheetSideConfrontants>;

const STORAGE_PREFIX = "sv_lotes_manual_confrontants_";

export function manualConfrontantsStorageKey(blockId: string): string {
  return `${STORAGE_PREFIX}${blockId}`;
}

export function loadManualConfrontants(
  blockId: string,
): ManualSideConfrontants | null {
  if (typeof window === "undefined" || !blockId) return null;
  try {
    const raw = localStorage.getItem(manualConfrontantsStorageKey(blockId));
    if (!raw) return null;
    return JSON.parse(raw) as ManualSideConfrontants;
  } catch {
    return null;
  }
}

export function saveManualConfrontants(
  blockId: string,
  value: ManualSideConfrontants,
): void {
  if (typeof window === "undefined" || !blockId) return;
  localStorage.setItem(
    manualConfrontantsStorageKey(blockId),
    JSON.stringify(value),
  );
}

export function clearManualConfrontants(blockId: string): void {
  if (typeof window === "undefined" || !blockId) return;
  localStorage.removeItem(manualConfrontantsStorageKey(blockId));
}

/** Confrontações apenas pela heurística automática (ignora correção manual). */
export function autoLotSideConfrontants(
  block: Record<string, unknown>,
  blockId: string,
  blocks: Record<string, unknown>[],
  streetGuides: Record<string, unknown>[],
  targetRing?: [number, number][],
  project?: Record<string, unknown> | null,
): LotSheetSideConfrontants {
  const official = getOfficialConfrontationRing(block, project);
  const ring =
    targetRing?.length
      ? targetRing
      : official.ok
        ? official.ring
        : latLngRingFromBlock(block);
  return buildSideConfrontantsFromSegments(
    block,
    blockId,
    ring,
    blocks,
    streetGuides,
    project,
  );
}

export function resolveLotSideConfrontants(
  block: Record<string, unknown>,
  blockId: string,
  blocks: Record<string, unknown>[],
  streetGuides: Record<string, unknown>[],
  manual?: ManualSideConfrontants | null,
  projectId?: string,
): LotSheetSideConfrontants {
  const ring = latLngRingFromBlock(block);
  const auto =
    (projectId ? getProjectLotConfrontants(projectId, blockId) : null) ??
    buildSideConfrontants(block, blockId, ring, blocks, streetGuides);
  const stored = manual ?? loadManualConfrontants(blockId);
  if (!stored) return auto;
  return {
    frente: stored.frente?.trim() || auto.frente,
    fundo: stored.fundo?.trim() || auto.fundo,
    ladoDireito: stored.ladoDireito?.trim() || auto.ladoDireito,
    ladoEsquerdo: stored.ladoEsquerdo?.trim() || auto.ladoEsquerdo,
  };
}
