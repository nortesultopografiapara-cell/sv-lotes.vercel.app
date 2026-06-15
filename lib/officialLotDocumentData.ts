/**
 * Dados oficiais compartilhados entre prancha PDF e memorial descritivo.
 */

import {
  buildLotConfrontationAudit,
  buildOfficialLotConfrontationSegmentRows,
  buildOfficialLotConfrontations,
  type LotConfrontationAudit,
  type OfficialLotConfrontationSegmentRow,
  type OfficialLotConfrontations,
} from '@/lib/assistedConfrontation';
import {
  getOfficialLotMeasurements,
  type OfficialLotMeasures,
} from '@/lib/officialLotMeasurements';
import { formatMemorialDistanceM } from '@/lib/memorial/memorialFormat';
import type { StreetGuideConfrontInput } from '@/lib/streetGuideConfrontation';

export type OfficialLotDocumentInput = {
  block: Record<string, unknown>;
  blockId: string;
  project: Record<string, unknown>;
  allBlocks: Record<string, unknown>[];
  streetGuides?: StreetGuideConfrontInput[];
};

export type OfficialLotDocumentBundle = {
  audit: LotConfrontationAudit;
  measures: OfficialLotMeasures;
  confrontations: OfficialLotConfrontations;
  segmentRows: OfficialLotConfrontationSegmentRow[];
  chanfreLabel: string;
};

/** Confrontações do quadro da prancha e do memorial — sem recálculo heurístico. */
export function officialLotDocumentConfrontations(
  input: OfficialLotDocumentInput,
): OfficialLotConfrontations {
  return buildOfficialLotDocumentBundle(input).confrontations;
}

export function buildOfficialLotDocumentBundle(
  input: OfficialLotDocumentInput,
): OfficialLotDocumentBundle {
  const guides = input.streetGuides ?? [];
  const audit = buildLotConfrontationAudit(
    input.block,
    input.blockId,
    input.allBlocks,
    guides as Record<string, unknown>[],
    input.project,
  );
  const measures = getOfficialLotMeasurements(
    input.block,
    input.block.number,
  );
  const chanfreLabel =
    measures.chanfre?.total != null
      ? formatMemorialDistanceM(measures.chanfre.total)
      : '—';
  const confrontations = buildOfficialLotConfrontations(audit, {
    block: input.block,
    allBlocks: input.allBlocks,
    project: input.project,
    streetGuides: guides,
    chanfre: chanfreLabel !== '—' ? chanfreLabel : null,
  });
  const segmentRows = buildOfficialLotConfrontationSegmentRows(
    input.block,
    audit,
    input.allBlocks,
    {
      project: input.project,
      streetGuides: guides,
    },
  );

  return {
    audit,
    measures,
    confrontations,
    segmentRows,
    chanfreLabel,
  };
}
