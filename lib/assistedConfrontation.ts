/**
 * Confrontação automática assistida (GIS-005) — auditoria, propagação e revisão.
 */

import { getOfficialConfrontationRing } from '@/lib/officialConfrontationRing';
import {
  sourceDisplayLabel,
  type ConfrontantPresetType,
  type ConfrontantSource,
} from '@/lib/confrontantTypes';
import {
  applyConfrontantToSegmentRows,
  getSegmentConfrontantRecord,
} from '@/lib/segmentConfrontantPersist';
import { applyAutoFrontStreetToBlockSegments } from '@/lib/autoFrontStreetSegments';
import {
  buildSideConfrontantsWithSources,
  resolveSideSegmentIndexes,
  type SideRole,
} from '@/lib/lotSegmentConfrontation';
import type { StreetGuideConfrontInput } from '@/lib/streetGuideConfrontation';
import type { LotSheetSideConfrontants } from '@/lib/lotSheetEnrichment';

export type SideAuditEntry = {
  label: string;
  source: ConfrontantSource;
  sourceLabel: string;
  pending: boolean;
  segmentIndexes: number[];
};

export type SegmentEdgeAudit = {
  ringEdgeIndex: number;
  segmentIndex: number;
  status: 'resolved' | 'pending' | 'manual' | 'conflict';
  confrontant: string | null;
  source: ConfrontantSource;
};

export type LotConfrontationAudit = {
  blockId: string;
  lotNumber: string;
  blockName: string;
  sides: Record<SideRole, SideAuditEntry>;
  confrontants: LotSheetSideConfrontants;
  segmentEdges: SegmentEdgeAudit[];
  pendingCount: number;
  hasPending: boolean;
};

export type PropagationScope = 'lot_only' | 'quadra_same_side' | 'aligned_nearby';

function sameQuadra(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  const qa = String(a.block_name ?? a.block ?? a.quadra ?? '').trim();
  const qb = String(b.block_name ?? b.block ?? b.quadra ?? '').trim();
  return qa.length > 0 && qa === qb;
}

function sideRoleForSegmentIndex(
  segmentIndex: number,
  sides: Record<SideRole, number[]>,
): SideRole | null {
  for (const role of [
    'frente',
    'fundo',
    'ladoDireito',
    'ladoEsquerdo',
  ] as SideRole[]) {
    const segIdxList = sides[role];
    for (const mergedIdx of segIdxList) {
      if (mergedIdx === segmentIndex) return role;
    }
  }
  return null;
}

/** Auditoria completa de confrontações de um lote. */
export function buildLotConfrontationAudit(
  block: Record<string, unknown>,
  blockId: string,
  allBlocks: Record<string, unknown>[],
  streetGuides: Record<string, unknown>[],
  project?: Record<string, unknown> | null,
): LotConfrontationAudit {
  const official = getOfficialConfrontationRing(block, project);
  const ring = official.ok ? official.ring : [];
  const built = buildSideConfrontantsWithSources(
    block,
    blockId,
    ring,
    allBlocks,
    streetGuides,
    project,
  );

  const blockResolved =
    built.sources.frente === 'street_guide' && !built.pending.frente
      ? applyAutoFrontStreetToBlockSegments(
          block,
          built.frente,
          'street_guide',
          allBlocks,
          project,
          streetGuides as StreetGuideConfrontInput[],
        )
      : block;

  const sideEntries = {} as Record<SideRole, SideAuditEntry>;
  let pendingCount = 0;
  for (const role of [
    'frente',
    'fundo',
    'ladoDireito',
    'ladoEsquerdo',
  ] as SideRole[]) {
    const pending = built.pending[role];
    if (pending) pendingCount += 1;
    sideEntries[role] = {
      label: built[role],
      source: built.sources[role],
      sourceLabel: sourceDisplayLabel(built.sources[role]),
      pending,
      segmentIndexes: built.sides[role],
    };
  }

  const segmentEdges: SegmentEdgeAudit[] = [];
  const n = built.segments.length;
  for (let mergedIdx = 0; mergedIdx < n; mergedIdx++) {
    const seg = built.segments[mergedIdx];
    const oi =
      typeof seg?.originalIndex === 'number' ? seg.originalIndex : mergedIdx;
    const manual = getSegmentConfrontantRecord(blockResolved, oi);
    const role = sideRoleForSegmentIndex(mergedIdx, built.sides);
    const sideAudit = role ? sideEntries[role] : null;

    let status: SegmentEdgeAudit['status'] = 'resolved';
    let source: ConfrontantSource = sideAudit?.source ?? 'auto';
    let confrontant = manual?.confrontant ?? sideAudit?.label ?? null;

    if (manual) {
      status = 'manual';
      source = 'manual';
    } else if (sideAudit?.pending) {
      status = 'pending';
      source = 'undefined';
      confrontant = null;
    } else if (sideAudit?.source === 'undefined') {
      status = 'conflict';
    }

    segmentEdges.push({
      ringEdgeIndex: oi,
      segmentIndex: oi,
      status,
      confrontant,
      source,
    });
  }

  return {
    blockId,
    lotNumber: String(block.number ?? block.lot ?? ''),
    blockName: String(block.block_name ?? block.block ?? ''),
    sides: sideEntries,
    confrontants: {
      frente: built.frente,
      fundo: built.fundo,
      ladoDireito: built.ladoDireito,
      ladoEsquerdo: built.ladoEsquerdo,
    },
    segmentEdges,
    pendingCount,
    hasPending: pendingCount > 0,
  };
}

/** Índices oficiais (segment_index) dos segmentos de um lado. */
export function officialSegmentIndexesForSide(
  block: Record<string, unknown>,
  allBlocks: Record<string, unknown>[],
  side: SideRole,
  project?: Record<string, unknown> | null,
  streetGuides: StreetGuideConfrontInput[] = [],
): number[] {
  const official = getOfficialConfrontationRing(block, project);
  if (!official.ok) return [];
  const { segments, sides } = resolveSideSegmentIndexes(
    block,
    official.ring,
    [],
    streetGuides,
  );
  const out: number[] = [];
  for (const mergedIdx of sides[side]) {
    const seg = segments[mergedIdx];
    if (!seg) continue;
    out.push(
      typeof seg.originalIndex === 'number' ? seg.originalIndex : mergedIdx,
    );
  }
  return [...new Set(out)];
}

export function findPropagationTargets(
  allBlocks: Record<string, unknown>[],
  sourceBlock: Record<string, unknown>,
  sourceBlockId: string,
  side: SideRole,
  scope: PropagationScope,
  project?: Record<string, unknown> | null,
): Array<{ blockId: string; block: Record<string, unknown>; segmentIndexes: number[] }> {
  if (scope === 'lot_only') {
    return [
      {
        blockId: sourceBlockId,
        block: sourceBlock,
        segmentIndexes: officialSegmentIndexesForSide(
          sourceBlock,
          allBlocks,
          side,
          project,
        ),
      },
    ];
  }

  const targets: Array<{
    blockId: string;
    block: Record<string, unknown>;
    segmentIndexes: number[];
  }> = [];

  for (const block of allBlocks) {
    const id = String(block.id || '');
    if (!id) continue;
    if (scope === 'quadra_same_side' && !sameQuadra(block, sourceBlock)) continue;
    if (scope === 'aligned_nearby' && !sameQuadra(block, sourceBlock)) continue;
    if (scope !== 'lot_only' && id === sourceBlockId) {
      /* incluir o próprio lote */
    }

    const indexes = officialSegmentIndexesForSide(
      block,
      allBlocks,
      side,
      project,
    );
    if (!indexes.length) continue;

    const audit = buildLotConfrontationAudit(
      block,
      id,
      allBlocks,
      [],
      project,
    );
    if (!audit.sides[side].pending && id !== sourceBlockId) continue;

    targets.push({ blockId: id, block, segmentIndexes: indexes });
  }

  return targets;
}

export function applyManualConfrontantToBlock(
  block: Record<string, unknown>,
  segmentIndexes: number[],
  confrontant: string,
  confrontantType: ConfrontantPresetType | string | null,
): Record<string, unknown> {
  const rows = applyConfrontantToSegmentRows(
    block,
    segmentIndexes,
    confrontant,
    confrontantType,
    'manual',
  );
  return { ...block, segments_json: rows };
}

export function lotHasPendingConfrontations(
  audit: LotConfrontationAudit,
): boolean {
  return audit.hasPending;
}
