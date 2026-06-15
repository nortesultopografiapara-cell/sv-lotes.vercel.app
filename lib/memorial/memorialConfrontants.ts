/**
 * Confrontante por segmento — mesma prioridade do painel do mapa (auditoria assistida).
 */

import {
  buildLotConfrontationAudit,
  buildOfficialLotConfrontationSegmentRows,
  buildOfficialLotConfrontations,
  officialSegmentIndexesForSide,
  type LotConfrontationAudit,
  type OfficialLotConfrontationSegmentRow,
} from '@/lib/assistedConfrontation';
import {
  isPendingConfrontantLabel,
  PENDING_CONFRONTANT_LABEL,
  type ConfrontantSource,
} from '@/lib/confrontantTypes';
import {
  parseOfficialSegmentsFromBlock,
  type OfficialSegmentClassification,
} from '@/lib/officialLotMeasurements';
import { resolveStoredFrontAsOfficialSegmentIndex } from '@/lib/resolveFrontStreetGuide';
import { formatStreetDisplay } from '@/lib/streetGuide';
import { getSegmentConfrontantRecord } from '@/lib/segmentConfrontantPersist';
import type { StreetGuideConfrontInput } from '@/lib/streetGuideConfrontation';
import type { SideRole } from '@/lib/lotSegmentConfrontation';
import type { MemorialSideSummary } from '@/lib/memorial/memorialTypes';

export type SegmentConfrontantResolved = {
  label: string;
  source: ConfrontantSource;
};

export type OfficialPopupConfrontationContext = {
  project?: Record<string, unknown> | null;
  streetGuides?: StreetGuideConfrontInput[];
  frenteConfrontLabel?: string | null;
  frontStreetLabel?: string | null;
};

/** Linhas da aba Confrontações do popup GIS — mesma função do GISMap. */
export function buildOfficialPopupConfrontationSegmentRows(
  block: Record<string, unknown>,
  audit: LotConfrontationAudit | null,
  allBlocks: Record<string, unknown>[],
  options?: OfficialPopupConfrontationContext,
): OfficialLotConfrontationSegmentRow[] {
  return buildOfficialLotConfrontationSegmentRows(block, audit, allBlocks, {
    project: options?.project,
    streetGuides: options?.streetGuides,
    frenteConfrontLabel: options?.frenteConfrontLabel,
    frontStreetLabel: options?.frontStreetLabel,
  });
}

/** Mapa segment_index → confrontante exibido no popup GIS. */
export function buildOfficialPopupConfrontantBySegment(
  block: Record<string, unknown>,
  audit: LotConfrontationAudit | null,
  allBlocks: Record<string, unknown>[],
  options?: OfficialPopupConfrontationContext,
): Map<number, string> {
  const rows = buildOfficialPopupConfrontationSegmentRows(
    block,
    audit,
    allBlocks,
    options,
  );
  const map = new Map<number, string>();
  for (const row of rows) {
    if (row.segmentIndex < 0) continue;
    const text = String(row.text ?? '').trim();
    if (text) map.set(row.segmentIndex, text);
  }
  return map;
}

/**
 * Pendência baseada somente nas linhas oficiais do popup GIS.
 * Não usa audit.hasPending nem heurística legada de lados agregados.
 */
export function officialPopupConfrontationsPending(
  block: Record<string, unknown>,
  audit: LotConfrontationAudit | null,
  allBlocks: Record<string, unknown>[],
  options?: OfficialPopupConfrontationContext,
): boolean {
  if (!audit || !allBlocks.length) return true;
  const rows = buildOfficialPopupConfrontationSegmentRows(
    block,
    audit,
    allBlocks,
    options,
  );
  const segmentRows = rows.filter((r) => r.segmentIndex >= 0);
  const target = segmentRows.length > 0 ? segmentRows : rows;
  return target.some((r) => isPendingConfrontantLabel(r.text));
}

function isUsableStreetName(raw: string): boolean {
  const t = raw.trim();
  if (!t || /sem nome/i.test(t)) return false;
  return !/^a\s*definir$/i.test(t);
}

/** Confrontante do segmento conforme auditoria do mapa (segmentEdges). */
export function confrontantFromAuditForSegment(
  audit: LotConfrontationAudit | null,
  segmentIndex: number,
): SegmentConfrontantResolved | null {
  if (!audit) return null;
  const edge = audit.segmentEdges.find((e) => e.segmentIndex === segmentIndex);
  if (!edge?.confrontant || isPendingConfrontantLabel(edge.confrontant)) {
    return null;
  }
  return {
    label: edge.confrontant,
    source: edge.source,
  };
}

function confrontantFromAuditSideMapping(
  audit: LotConfrontationAudit | null,
  block: Record<string, unknown>,
  segmentIndex: number,
  projectBlocks: Record<string, unknown>[],
  project: Record<string, unknown> | null | undefined,
  streetGuides: StreetGuideConfrontInput[],
): SegmentConfrontantResolved | null {
  if (!audit || !projectBlocks.length) return null;
  const roles: SideRole[] = [
    'frente',
    'fundo',
    'ladoDireito',
    'ladoEsquerdo',
  ];
  for (const role of roles) {
    const indexes = officialSegmentIndexesForSide(
      block,
      projectBlocks,
      role,
      project,
      streetGuides,
    );
    if (!indexes.includes(segmentIndex)) continue;
    const side = audit.sides[role];
    if (!side?.label || isPendingConfrontantLabel(side.label)) continue;
    return { label: side.label, source: side.source };
  }
  return null;
}

export function buildMemorialSideSummaryFromAudit(
  audit: LotConfrontationAudit | null,
  chanfre: string,
  block?: Record<string, unknown>,
  allBlocks?: Record<string, unknown>[],
  project?: Record<string, unknown> | null,
): MemorialSideSummary {
  if (block && allBlocks?.length) {
    const official = buildOfficialLotConfrontations(audit, {
      block,
      allBlocks,
      project,
      chanfre: chanfre?.trim() && chanfre !== '—' ? chanfre : null,
    });
    return {
      frente: official.frente,
      fundo: official.fundo,
      ladoDireito: official.ladoDireito,
      ladoEsquerdo: official.ladoEsquerdo,
      chanfre: official.chanfre ?? chanfre,
    };
  }
  const legacy = audit
    ? {
        frente: audit.confrontants.frente || audit.sides.frente.label,
        fundo: audit.confrontants.fundo || audit.sides.fundo.label,
        ladoDireito:
          audit.confrontants.ladoDireito || audit.sides.ladoDireito.label,
        ladoEsquerdo:
          audit.confrontants.ladoEsquerdo || audit.sides.ladoEsquerdo.label,
      }
    : {
        frente: '—',
        fundo: '—',
        ladoDireito: '—',
        ladoEsquerdo: '—',
      };
  return {
    ...legacy,
    chanfre,
  };
}

/**
 * Prioridade (igual ao popup):
 * 1. confrontante manual/auto confirmado em segments_json
 * 2. auditoria assistida (lados + segmentEdges — sem recalcular heurística extra)
 * 3. frente salva (front_street_name) só para segmento de frente sem auditoria
 * 4. A DEFINIR
 */
export function resolveMemorialSegmentConfrontant(
  block: Record<string, unknown>,
  segmentIndex: number,
  _classification: OfficialSegmentClassification,
  audit: LotConfrontationAudit | null,
  streetGuides: StreetGuideConfrontInput[],
  projectBlocks: Record<string, unknown>[] = [],
  project?: Record<string, unknown> | null,
): SegmentConfrontantResolved {
  const manual = getSegmentConfrontantRecord(block, segmentIndex);
  if (manual?.confrontant && !isPendingConfrontantLabel(manual.confrontant)) {
    return {
      label: manual.confrontant,
      source: manual.confrontant_source || 'manual',
    };
  }

  const fromAudit = confrontantFromAuditForSegment(audit, segmentIndex);
  if (fromAudit) return fromAudit;

  const fromSide = confrontantFromAuditSideMapping(
    audit,
    block,
    segmentIndex,
    projectBlocks,
    project,
    streetGuides,
  );
  if (fromSide) return fromSide;

  const savedStreet = String(block.front_street_name || '').trim();
  const officialSegments = parseOfficialSegmentsFromBlock(
    block,
    block.number ?? block.id,
  );
  const frontIdx =
    resolveStoredFrontAsOfficialSegmentIndex(block, officialSegments) ?? -1;
  if (
    segmentIndex === frontIdx &&
    isUsableStreetName(savedStreet)
  ) {
    const label =
      formatStreetDisplay(
        block.front_street_type as string | undefined,
        savedStreet,
      ) || savedStreet;
    return { label, source: 'street_guide' };
  }

  if (manual?.confrontant) {
    return {
      label: manual.confrontant,
      source: manual.confrontant_source || 'undefined',
    };
  }

  return {
    label: PENDING_CONFRONTANT_LABEL,
    source: 'undefined',
  };
}

export function buildLotConfrontationAuditForMemorial(
  block: Record<string, unknown>,
  blockId: string,
  projectBlocks: Record<string, unknown>[],
  streetGuides: Record<string, unknown>[],
  project?: Record<string, unknown> | null,
): LotConfrontationAudit | null {
  if (!blockId || !projectBlocks.length) return null;
  return buildLotConfrontationAudit(
    block,
    blockId,
    projectBlocks,
    streetGuides,
    project,
  );
}

export function memorialHasPendingConfrontations(
  block: Record<string, unknown>,
  audit: LotConfrontationAudit | null,
  allBlocks: Record<string, unknown>[],
  project?: Record<string, unknown> | null,
  streetGuides: StreetGuideConfrontInput[] = [],
): boolean {
  return officialPopupConfrontationsPending(block, audit, allBlocks, {
    project,
    streetGuides,
  });
}

/** Rótulos dos quatro lados para quadro resumo (popup). */
export function memorialConfrontantSidesFromAudit(
  audit: LotConfrontationAudit | null,
): Record<SideRole, string> | null {
  if (!audit) return null;
  return {
    frente: audit.sides.frente.label,
    fundo: audit.sides.fundo.label,
    ladoDireito: audit.sides.ladoDireito.label,
    ladoEsquerdo: audit.sides.ladoEsquerdo.label,
  };
}
