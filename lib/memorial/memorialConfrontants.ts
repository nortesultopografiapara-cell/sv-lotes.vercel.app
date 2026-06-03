/**
 * Confrontante por segmento — prioridade oficial (segments_json + auditoria).
 */

import { buildLotConfrontationAudit } from '@/lib/assistedConfrontation';
import {
  isPendingConfrontantLabel,
  PENDING_CONFRONTANT_LABEL,
  type ConfrontantSource,
} from '@/lib/confrontantTypes';
import type { OfficialSegmentClassification } from '@/lib/officialLotMeasurements';
import { formatStreetDisplay } from '@/lib/streetGuide';
import { resolveFrontStreetGuideForLot } from '@/lib/resolveFrontStreetGuide';
import { getSegmentConfrontantRecord } from '@/lib/segmentConfrontantPersist';
import type { StreetGuideConfrontInput } from '@/lib/streetGuideConfrontation';
import type { SideRole } from '@/lib/lotSegmentConfrontation';
import type { LotConfrontationAudit } from '@/lib/assistedConfrontation';

export type SegmentConfrontantResolved = {
  label: string;
  source: ConfrontantSource;
};

function isUsableStreetName(raw: string): boolean {
  const t = raw.trim();
  if (!t || /sem nome/i.test(t)) return false;
  return !/^a\s*definir$/i.test(t);
}

function sideRoleFromClassification(
  c: OfficialSegmentClassification,
): SideRole | null {
  switch (c) {
    case 'frente':
      return 'frente';
    case 'fundo':
      return 'fundo';
    case 'lado_direito':
      return 'ladoDireito';
    case 'lado_esquerdo':
      return 'ladoEsquerdo';
    default:
      return null;
  }
}

function labelFromAuditSide(
  audit: LotConfrontationAudit | null,
  role: SideRole,
): SegmentConfrontantResolved | null {
  if (!audit) return null;
  const entry = audit.sides[role];
  if (!entry?.label || isPendingConfrontantLabel(entry.label)) return null;
  return { label: entry.label, source: entry.source };
}

/**
 * Prioridade: manual em segments_json → frente/rua → auditoria por lado → A DEFINIR.
 */
export function resolveMemorialSegmentConfrontant(
  block: Record<string, unknown>,
  segmentIndex: number,
  classification: OfficialSegmentClassification,
  audit: LotConfrontationAudit | null,
  streetGuides: StreetGuideConfrontInput[],
): SegmentConfrontantResolved {
  const rec = getSegmentConfrontantRecord(block, segmentIndex);
  if (rec?.confrontant && !isPendingConfrontantLabel(rec.confrontant)) {
    return {
      label: rec.confrontant,
      source: rec.confrontant_source || 'manual',
    };
  }

  const savedStreet = String(block.front_street_name || '').trim();
  if (classification === 'frente' && isUsableStreetName(savedStreet)) {
    const label =
      formatStreetDisplay(block.front_street_type as string | undefined, savedStreet) ||
      savedStreet;
    return { label, source: 'street_guide' };
  }

  if (classification === 'frente' && streetGuides.length) {
    const match = resolveFrontStreetGuideForLot(block, streetGuides);
    if (match?.streetGuideName && !/sem nome/i.test(match.streetGuideName)) {
      return { label: match.streetGuideName, source: 'street_guide' };
    }
  }

  const role = sideRoleFromClassification(classification);
  if (role) {
    const fromSide = labelFromAuditSide(audit, role);
    if (fromSide) return fromSide;
  }

  if (rec?.confrontant) {
    return {
      label: rec.confrontant,
      source: rec.confrontant_source || 'undefined',
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
