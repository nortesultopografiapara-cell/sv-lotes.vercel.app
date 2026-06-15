/**
 * Vértices e segmentos do memorial a partir de segments_json oficial.
 */

import {
  getOfficialLotSegmentTable,
  parseOfficialSegmentsFromBlock,
  type OfficialLotSegmentTableResult,
} from '@/lib/officialLotMeasurements';
import { formatAzimuthDms, azimuthFromCoordinates } from '@/lib/azimuthFormat';
import {
  formatMemorialCoord,
  formatMemorialDistanceM,
  memorialVertexLabel,
} from '@/lib/memorial/memorialFormat';
import {
  buildLotConfrontationAuditForMemorial,
  resolveOfficialMemorialSegmentConfrontant,
} from '@/lib/memorial/memorialConfrontants';
import type { MemorialSegmentRow } from '@/lib/memorial/memorialTypes';
import {
  asStreetGuideList,
  type StreetGuideConfrontInput,
} from '@/lib/streetGuideConfrontation';

export function getOfficialSegmentTableForMemorial(
  block: Record<string, unknown>,
  project?: Record<string, unknown> | null,
): OfficialLotSegmentTableResult {
  return getOfficialLotSegmentTable(block, project);
}

export function buildMemorialSegments(
  block: Record<string, unknown>,
  blockId: string,
  projectBlocks: Record<string, unknown>[],
  streetGuides: StreetGuideConfrontInput[],
  project?: Record<string, unknown> | null,
): MemorialSegmentRow[] {
  const table = getOfficialSegmentTableForMemorial(block, project);
  const parsed = parseOfficialSegmentsFromBlock(block, block.number ?? block.id);
  const guides = asStreetGuideList(streetGuides);
  const audit = buildLotConfrontationAuditForMemorial(
    block,
    blockId,
    projectBlocks,
    guides as Record<string, unknown>[],
    project,
  );
  const popupCtx = { project, streetGuides: guides };

  const byIndex = new Map(parsed.map((s) => [s.segment_index, s]));
  const out: MemorialSegmentRow[] = [];

  for (const row of table.validRows) {
    const seg = byIndex.get(row.segment_index);
    if (!seg) continue;

    const northStart = seg.north;
    const eastStart = seg.east;
    let northEnd = seg.north;
    let eastEnd = seg.east;
    const endMatch = parsed.find(
      (p) => p.vertex_order === ((seg.vertex_order + 1) % parsed.length),
    );
    if (endMatch) {
      northEnd = endMatch.north;
      eastEnd = endMatch.east;
    } else if (seg.end_north != null && seg.end_east != null) {
      northEnd = seg.end_north;
      eastEnd = seg.end_east;
    }

    const azDeg = azimuthFromCoordinates(northStart, eastStart, northEnd, eastEnd);
    const distanceM = row.distanceM ?? seg.distance;
    const confront = resolveOfficialMemorialSegmentConfrontant(
      block,
      row.segment_index,
      audit,
      projectBlocks,
      popupCtx,
    );

    const isCurve =
      row.distancia.includes('curva') ||
      seg.segment_type === 'CURVE' ||
      row.classification === 'curva';

    out.push({
      segmentIndex: row.segment_index,
      fromVertex: memorialVertexLabel(seg.vertex_order),
      toVertex: row.para,
      northStart,
      eastStart,
      northEnd,
      eastEnd,
      coordNStart: formatMemorialCoord(northStart),
      coordEStart: formatMemorialCoord(eastStart),
      coordNEnd: formatMemorialCoord(northEnd),
      coordEEnd: formatMemorialCoord(eastEnd),
      azimuth: row.azimute || formatAzimuthDms(azDeg),
      distanceM,
      distanceLabel: formatMemorialDistanceM(distanceM),
      confrontant: confront.label,
      confrontantSource: confront.source,
      isCurve,
      curveDescription: isCurve ? row.distancia : null,
    });
  }

  return out;
}
