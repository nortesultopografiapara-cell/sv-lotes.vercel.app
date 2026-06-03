/**
 * Vincula a frente oficial do lote à linha de rua nomeada (street_guides).
 */

import { formatStreetDisplay } from '@/lib/streetGuide';
import {
  confrontantFromStreetGuidesForUtmSegment,
  STREET_GUIDE_CONFRONT_TOLERANCE_M,
  type StreetGuideConfrontInput,
} from '@/lib/streetGuideConfrontation';
import {
  getOfficialConfrontationRing,
  planarBearingDeg,
  planarDistanceM,
  utmRingToClosedCoords,
} from '@/lib/officialConfrontationRing';
import { mergeCurvedSegments, type Segment } from '@/utils/calculateLotDimensions';

function extractUtmSegmentsLocal(
  coords: number[][],
  allPolys: number[][][],
): Segment[] {
  const segments: Segment[] = [];
  if (!Array.isArray(coords) || coords.length < 2) return segments;
  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const length = planarDistanceM(p1, p2);
    if (length < 0.5) continue;
    segments.push({
      p1,
      p2,
      length,
      azimuth: planarBearingDeg(p1, p2),
      originalIndex: i,
      isExternal: true,
    });
  }
  for (const seg of segments) {
    let matched = false;
    for (const other of allPolys) {
      if (other === coords) continue;
      for (let j = 0; j < other.length - 1; j++) {
        const d1 = planarDistanceM(seg.p1, other[j]);
        const d2 = planarDistanceM(seg.p2, other[j + 1]);
        const d3 = planarDistanceM(seg.p1, other[j + 1]);
        const d4 = planarDistanceM(seg.p2, other[j]);
        if ((d1 < 1.0 && d2 < 1.0) || (d3 < 1.0 && d4 < 1.0)) {
          matched = true;
          break;
        }
      }
      if (matched) break;
    }
    seg.isExternal = !matched;
  }
  return segments;
}

export type FrontStreetGuideMatch = {
  streetGuideId: string | null;
  streetGuideName: string;
  streetGuideType: string | null;
  distanceM: number;
  confidence: number;
};

export type FrontStreetPersistFields = {
  front_street_id: string | null;
  front_street_name: string | null;
  front_street_type: string | null;
};

function readSegmentsJsonArray(block: Record<string, unknown>): unknown[] | null {
  const raw = block.segments_json;
  if (Array.isArray(raw) && raw.length >= 2) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length >= 2) return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

/** Confrontante textual no segmento oficial da frente (segments_json). */
export function confrontantNameFromFrontSegmentJson(
  block: Record<string, unknown>,
): string | null {
  const stored = block.front_segment_index;
  if (typeof stored !== 'number' || stored < 0) return null;
  const raw = readSegmentsJsonArray(block);
  if (!raw) return null;

  const item = raw.find((row, i) => {
    if (row == null || typeof row !== 'object') return false;
    const s = row as Record<string, unknown>;
    const idx =
      typeof s.segment_index === 'number' ? s.segment_index : i;
    return idx === stored;
  }) as Record<string, unknown> | undefined;

  if (!item) return null;
  const candidates = [
    item.confrontante,
    item.confronting,
    item.street_name,
    item.logradouro,
    item.street,
  ];
  for (const c of candidates) {
    const t = String(c ?? '').trim();
    if (t && !/sem nome/i.test(t)) return t;
  }
  return null;
}

function extractFrontUtmSegment(
  block: Record<string, unknown>,
  allPolysUtm: number[][][],
): Segment | null {
  const official = getOfficialConfrontationRing(block);
  if (!official.ok) return null;
  const coords = utmRingToClosedCoords(official.ring);
  if (coords.length < 4) return null;
  const segments = mergeCurvedSegments(
    extractUtmSegmentsLocal(coords, allPolysUtm),
    20,
  );
  if (!segments.length) return null;

  let frontIndex = -1;
  const stored = block.front_segment_index;
  if (typeof stored === 'number' && stored >= 0) {
    const byOriginal = segments.findIndex((s) => s.originalIndex === stored);
    if (byOriginal >= 0) frontIndex = byOriginal;
    else if (stored < segments.length) frontIndex = stored;
  }
  if (frontIndex < 0) return null;
  return segments[frontIndex] ?? null;
}

/**
 * Detecta a street_guide mais próxima e paralela à aresta de frente oficial.
 */
export function resolveFrontStreetGuideForLot(
  block: Record<string, unknown>,
  streetGuides: StreetGuideConfrontInput[],
  toleranceM: number = STREET_GUIDE_CONFRONT_TOLERANCE_M,
): FrontStreetGuideMatch | null {
  const official = getOfficialConfrontationRing(block);
  const allPolysUtm = official.ok
    ? [utmRingToClosedCoords(official.ring)]
    : [];
  const frontSeg = extractFrontUtmSegment(block, allPolysUtm);
  if (!frontSeg) return null;

  const hit = confrontantFromStreetGuidesForUtmSegment(
    frontSeg,
    block,
    streetGuides,
    toleranceM,
  );
  if (!hit?.label) return null;

  const guide = streetGuides.find(
    (g) => g.id != null && String(g.id) === String(hit.guideId),
  );
  const type = guide?.type != null ? String(guide.type) : 'Rua';
  const tol = Math.max(toleranceM, 0.01);
  const confidence = Math.max(0, Math.min(1, 1 - 0 / tol));

  return {
    streetGuideId: hit.guideId ?? null,
    streetGuideName: hit.label,
    streetGuideType: type,
    distanceM: 0,
    confidence,
  };
}

export function streetFieldsFromGuideMatch(
  match: FrontStreetGuideMatch | null,
): FrontStreetPersistFields {
  if (!match) {
    return {
      front_street_id: null,
      front_street_name: null,
      front_street_type: null,
    };
  }
  return {
    front_street_id: match.streetGuideId,
    front_street_name: match.streetGuideName,
    front_street_type: match.streetGuideType,
  };
}

function lotBlockFromLotLike(lot: Record<string, unknown>): Record<string, unknown> {
  return {
    ...lot,
    front_segment_index:
      lot.front_segment_index ?? lot.frontSegmentIndex ?? null,
    front_street_name: lot.front_street_name ?? lot.frontStreetName ?? null,
    front_street_type: lot.front_street_type ?? lot.frontStreetType ?? null,
    front_street_id: lot.front_street_id ?? lot.frontStreetId ?? null,
    segments_json: lot.segments_json,
  };
}

/**
 * Nome da rua para popup — prioridade: salvo → segments_json → proximidade.
 */
export function resolveLotFrontStreetDisplay(
  lotOrBlock: Record<string, unknown>,
  streetGuides: StreetGuideConfrontInput[] = [],
): string | null {
  const block = lotBlockFromLotLike(lotOrBlock);
  const saved = String(block.front_street_name || '').trim();
  if (saved && !/sem nome/i.test(saved) && !/^rua\/eixo/i.test(saved)) {
    return formatStreetDisplay(
      block.front_street_type as string | undefined,
      saved,
    );
  }

  const fromSeg = confrontantNameFromFrontSegmentJson(block);
  if (fromSeg && !/sem nome/i.test(fromSeg)) return fromSeg;

  const match = resolveFrontStreetGuideForLot(block, streetGuides);
  if (match?.streetGuideName && !/sem nome/i.test(match.streetGuideName)) {
    return match.streetGuideName;
  }

  return null;
}

/** Rótulo de confrontação da frente (memorial / prancha / automático). */
export function resolveFrenteConfrontantLabel(
  block: Record<string, unknown>,
  frontSegmentIndexes: number[],
  segments: Segment[],
  streetGuides: StreetGuideConfrontInput[],
): string {
  const saved = String(block.front_street_name || '').trim();
  if (saved && !/sem nome/i.test(saved)) {
    return (
      formatStreetDisplay(block.front_street_type as string | undefined, saved) ||
      saved
    );
  }

  for (const idx of frontSegmentIndexes) {
    const seg = segments[idx];
    if (!seg) continue;
    const fromStreet = confrontantFromStreetGuidesForUtmSegment(
      seg,
      block,
      streetGuides,
    );
    if (fromStreet?.label && !/sem nome/i.test(fromStreet.label)) {
      return fromStreet.label;
    }
  }

  const fromSeg = confrontantNameFromFrontSegmentJson(block);
  if (fromSeg && !/sem nome/i.test(fromSeg)) return fromSeg;

  const match = resolveFrontStreetGuideForLot(block, streetGuides);
  if (match?.streetGuideName) return match.streetGuideName;

  return 'A definir';
}
