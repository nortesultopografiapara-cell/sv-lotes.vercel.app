/**
 * Confrontante por segmento — mesma prioridade do painel do mapa (auditoria assistida).
 */

import {
  buildLotConfrontationAudit,
  confrontantsFromAudit,
  officialSegmentIndexesForSide,
  type LotConfrontationAudit,
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
): MemorialSideSummary {
  return {
    ...confrontantsFromAudit(audit),
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
  segments: { confrontant: string }[],
  audit: LotConfrontationAudit | null,
): boolean {
  if (audit?.hasPending) return true;
  return segments.some((s) => isPendingConfrontantLabel(s.confrontant));
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
