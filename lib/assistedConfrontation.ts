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
  clearManualConfrontantFromSegmentRows,
  getSegmentConfrontantRecord,
} from '@/lib/segmentConfrontantPersist';
import { applyAutoFrontStreetToBlockSegments } from '@/lib/autoFrontStreetSegments';
import {
  buildAllPolysUtm,
  buildSideConfrontantsWithSources,
  resolveConfrontantForMergedSegment,
  resolveSideSegmentIndexes,
  type SideRole,
} from '@/lib/lotSegmentConfrontation';
import {
  concatDistinctSideConfrontants,
  isPendingConfrontantLabel,
} from '@/lib/confrontantTypes';
import {
  asStreetGuideList,
  type StreetGuideConfrontInput,
} from '@/lib/streetGuideConfrontation';
import type { LotSheetSideConfrontants } from '@/lib/lotSheetEnrichment';
import { wgs84RingEdgeForMergedSegmentIndex } from '@/lib/resolveFrontStreetGuide';

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

const EMPTY_SIDE_CONFRONTANT = '—';

export type OfficialLotConfrontationsContext = {
  block: Record<string, unknown>;
  allBlocks: Record<string, unknown>[];
  project?: Record<string, unknown> | null;
  streetGuides?: StreetGuideConfrontInput[];
  /** Rótulo de frente já resolvido no popup (rua / confrontante). */
  frenteConfrontLabel?: string | null;
  frontStreetLabel?: string | null;
  chanfre?: string | null;
};

export type OfficialLotConfrontations = LotSheetSideConfrontants & {
  chanfre?: string;
};

export type OfficialLotConfrontationSegmentRow = {
  key: SideRole;
  sideLabel: string;
  segmentIndex: number;
  text: string;
  origin: string;
};

const OFFICIAL_SIDE_UI_LABELS: ReadonlyArray<[SideRole, string]> = [
  ['frente', 'Frente'],
  ['fundo', 'Fundo'],
  ['ladoDireito', 'Lado Direito'],
  ['ladoEsquerdo', 'Lado Esquerdo'],
];

function emptyOfficialLotConfrontations(
  chanfre?: string | null,
): OfficialLotConfrontations {
  return {
    frente: EMPTY_SIDE_CONFRONTANT,
    fundo: EMPTY_SIDE_CONFRONTANT,
    ladoDireito: EMPTY_SIDE_CONFRONTANT,
    ladoEsquerdo: EMPTY_SIDE_CONFRONTANT,
    ...(chanfre?.trim() ? { chanfre: chanfre.trim() } : {}),
  };
}


/**
 * Linhas por segmento — mesma montagem da aba Confrontações do popup GIS.
 */
export function buildOfficialLotConfrontationSegmentRows(
  block: Record<string, unknown>,
  audit: LotConfrontationAudit | null,
  allBlocks: Record<string, unknown>[],
  options?: {
    project?: Record<string, unknown> | null;
    streetGuides?: StreetGuideConfrontInput[];
    frenteConfrontLabel?: string | null;
    frontStreetLabel?: string | null;
  },
): OfficialLotConfrontationSegmentRow[] {
  if (!audit) return [];
  const project = options?.project ?? null;
  const streetGuides = options?.streetGuides ?? [];
  const frenteConfrontLabel = options?.frenteConfrontLabel ?? null;
  const frontStreetLabel = options?.frontStreetLabel ?? null;
  const rows: OfficialLotConfrontationSegmentRow[] = [];

  for (const [key, sideLabel] of OFFICIAL_SIDE_UI_LABELS) {
    const indexes = officialSegmentIndexesForSide(
      block,
      allBlocks,
      key,
      project,
      streetGuides,
    );
    if (!indexes.length) {
      const entry = audit.sides[key];
      const text =
        key === 'frente' && frenteConfrontLabel
          ? frenteConfrontLabel
          : entry?.label ?? 'A DEFINIR';
      const origin =
        key === 'frente' && frontStreetLabel
          ? 'rua'
          : entry?.sourceLabel ?? '—';
      rows.push({
        key,
        sideLabel,
        segmentIndex: -1,
        text,
        origin,
      });
      continue;
    }
    for (const segIdx of indexes) {
      const edge = audit.segmentEdges.find((e) => e.segmentIndex === segIdx);
      const entry = audit.sides[key];
      const text =
        edge?.confrontant ??
        (key === 'frente' && frenteConfrontLabel
          ? frenteConfrontLabel
          : entry?.label ?? 'A DEFINIR');
      const origin = edge?.source
        ? sourceDisplayLabel(edge.source)
        : key === 'frente' && frontStreetLabel
          ? 'rua'
          : entry?.sourceLabel ?? '—';
      rows.push({
        key,
        sideLabel,
        segmentIndex: segIdx,
        text,
        origin,
      });
    }
  }
  return rows;
}

function consolidateSideLabels(labels: string[]): string {
  if (!labels.length) return EMPTY_SIDE_CONFRONTANT;
  const joined = concatDistinctSideConfrontants(labels);
  return joined === 'A DEFINIR' ? EMPTY_SIDE_CONFRONTANT : joined;
}

/**
 * Confrontações oficiais por lado — fonte única para popup, prancha, memorial e contrato.
 * Usa segmentEdges + índices oficiais por lado (sem audit.confrontants agregado).
 */
export function buildOfficialLotConfrontations(
  audit: LotConfrontationAudit | null,
  context: OfficialLotConfrontationsContext,
): OfficialLotConfrontations {
  const { chanfre, frenteConfrontLabel, ...ctx } = context;
  if (!audit) return emptyOfficialLotConfrontations(chanfre);

  const rows = buildOfficialLotConfrontationSegmentRows(
    context.block,
    audit,
    context.allBlocks,
    {
      project: ctx.project,
      streetGuides: ctx.streetGuides,
      frenteConfrontLabel,
      frontStreetLabel: ctx.frontStreetLabel,
    },
  );

  const byRole: Record<SideRole, string[]> = {
    frente: [],
    fundo: [],
    ladoDireito: [],
    ladoEsquerdo: [],
  };
  for (const row of rows) {
    const text = String(row.text ?? '').trim();
    if (!text || isPendingConfrontantLabel(text)) continue;
    byRole[row.key].push(text);
  }

  return {
    frente: consolidateSideLabels(byRole.frente),
    fundo: consolidateSideLabels(byRole.fundo),
    ladoDireito: consolidateSideLabels(byRole.ladoDireito),
    ladoEsquerdo: consolidateSideLabels(byRole.ladoEsquerdo),
    ...(chanfre?.trim() ? { chanfre: chanfre.trim() } : {}),
  };
}

/** Confrontantes por lado — delega para buildOfficialLotConfrontations quando há contexto. */
export function confrontantsFromAudit(
  audit: LotConfrontationAudit | null,
  context?: Omit<OfficialLotConfrontationsContext, 'block' | 'allBlocks'> & {
    block?: Record<string, unknown>;
    allBlocks?: Record<string, unknown>[];
  },
): LotSheetSideConfrontants {
  if (context?.block && context.allBlocks?.length) {
    const { chanfre: _c, ...sides } = buildOfficialLotConfrontations(audit, {
      block: context.block,
      allBlocks: context.allBlocks,
      project: context.project,
      streetGuides: context.streetGuides,
      frenteConfrontLabel: context.frenteConfrontLabel,
      frontStreetLabel: context.frontStreetLabel,
      chanfre: context.chanfre,
    });
    return sides;
  }
  if (!audit) {
    return {
      frente: EMPTY_SIDE_CONFRONTANT,
      fundo: EMPTY_SIDE_CONFRONTANT,
      ladoDireito: EMPTY_SIDE_CONFRONTANT,
      ladoEsquerdo: EMPTY_SIDE_CONFRONTANT,
    };
  }
  const c = audit.confrontants;
  const s = audit.sides;
  return {
    frente: c.frente || s.frente.label || EMPTY_SIDE_CONFRONTANT,
    fundo: c.fundo || s.fundo.label || EMPTY_SIDE_CONFRONTANT,
    ladoDireito: c.ladoDireito || s.ladoDireito.label || EMPTY_SIDE_CONFRONTANT,
    ladoEsquerdo:
      c.ladoEsquerdo || s.ladoEsquerdo.label || EMPTY_SIDE_CONFRONTANT,
  };
}

export type PropagationScope = 'lot_only' | 'quadra_same_side' | 'aligned_nearby';

function ensureSideIndexArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (x): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0,
  );
}

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
    const segIdxList = ensureSideIndexArray(sides[role]);
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

  const allPolysUtm = buildAllPolysUtm(allBlocks, project);
  const guides = asStreetGuideList(streetGuides);

  const segmentEdges: SegmentEdgeAudit[] = [];
  const n = built.segments.length;
  for (let mergedIdx = 0; mergedIdx < n; mergedIdx++) {
    const seg = built.segments[mergedIdx];
    const oi =
      typeof seg?.originalIndex === 'number' ? seg.originalIndex : mergedIdx;
    const manual = getSegmentConfrontantRecord(blockResolved, oi);
    const role = sideRoleForSegmentIndex(mergedIdx, built.sides);
    const perSegment = resolveConfrontantForMergedSegment(
      mergedIdx,
      built.segments,
      allBlocks,
      blockResolved,
      blockId,
      allPolysUtm,
      project,
      role ?? undefined,
      guides,
    );

    let status: SegmentEdgeAudit['status'] = 'resolved';
    let source: ConfrontantSource = perSegment.source;
    let confrontant =
      manual?.confrontant ??
      (perSegment.pending || isPendingConfrontantLabel(perSegment.label)
        ? null
        : perSegment.label);

    if (manual) {
      status = 'manual';
      source = 'manual';
    } else if (perSegment.pending) {
      status = 'pending';
      source = 'undefined';
      confrontant = null;
    } else if (perSegment.source === 'undefined') {
      status = 'conflict';
    }

    const ringEdgeIdx = wgs84RingEdgeForMergedSegmentIndex(
      block,
      built.segments,
      mergedIdx,
    );

    segmentEdges.push({
      ringEdgeIndex: ringEdgeIdx >= 0 ? ringEdgeIdx : oi,
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
  for (const mergedIdx of ensureSideIndexArray(sides[side])) {
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

export function clearManualConfrontantFromBlock(
  block: Record<string, unknown>,
  segmentIndexes: number[],
): Record<string, unknown> {
  const rows = clearManualConfrontantFromSegmentRows(block, segmentIndexes);
  return { ...block, segments_json: rows };
}

export function lotHasPendingConfrontations(
  audit: LotConfrontationAudit,
): boolean {
  return audit.hasPending;
}
