/**
 * Perímetro oficial para confrontação automática (UTM — mesma fonte da prancha TXT).
 */

import { buildUtmRingFromOfficialSegments } from '@/lib/civil3dTxtParser';
import { normalizeLotGeometry } from '@/lib/lotGeometryNormalize';
import { parseOfficialSegmentsFromBlock } from '@/lib/officialLotMeasurements';

export type OfficialConfrontationRingSource =
  | 'segments_json'
  | 'coordinates_utm_json'
  | 'geometry';

export type OfficialConfrontationRingResult = {
  ok: boolean;
  ring: [number, number][];
  source: OfficialConfrontationRingSource;
  reason?: string;
};

function parseJsonMaybe<T>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return null;
    try {
      return JSON.parse(t) as T;
    } catch {
      return null;
    }
  }
  return value as T;
}

function closeUtmRing(ring: [number, number][]): [number, number][] {
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.01) return ring;
  return [...ring, [first[0], first[1]]];
}

function ringFromUtmPairs(pairs: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const p of pairs) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const e = Number(p[0]);
    const n = Number(p[1]);
    if (!Number.isFinite(e) || !Number.isFinite(n)) continue;
    out.push([e, n]);
  }
  return closeUtmRing(out);
}

function ringFromCoordinatesUtmJson(block: Record<string, unknown>): [number, number][] {
  const raw = parseJsonMaybe<unknown>(block.coordinates_utm_json);
  const arr = (raw ?? block.coordinates_utm_json) as unknown;
  if (!Array.isArray(arr) || arr.length < 3) return [];
  const pairs: [number, number][] = [];
  for (const p of arr) {
    if (!Array.isArray(p) || p.length < 2) continue;
    pairs.push([Number(p[0]), Number(p[1])]);
  }
  return ringFromUtmPairs(pairs);
}

/** Fallback: geometry lat/lng → metros locais (origem no 1º vértice). */
function ringFromGeometryLocalMeters(
  block: Record<string, unknown>,
): [number, number][] {
  const geom = normalizeLotGeometry(block);
  if (!geom.ok || geom.ring.length < 3) return [];
  const origin = geom.ring[0];
  const lat0 = origin[0];
  const lng0 = origin[1];
  const mPerDegLat = 111320;
  const mPerDegLng =
    111320 * Math.cos((lat0 * Math.PI) / 180) || 111320;
  const out: [number, number][] = [];
  for (const [lat, lng] of geom.ring) {
    const e = (lng - lng0) * mPerDegLng;
    const n = (lat - lat0) * mPerDegLat;
    if (Number.isFinite(e) && Number.isFinite(n)) out.push([e, n]);
  }
  return closeUtmRing(out);
}

function isUsefulRing(ring: [number, number][]): boolean {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  for (const pt of ring) {
    if (!Array.isArray(pt) || pt.length < 2) return false;
    if (!Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) return false;
  }
  const unique = new Set(ring.map(([e, n]) => `${e.toFixed(3)},${n.toFixed(3)}`));
  return unique.size >= 3;
}

/**
 * Perímetro para confrontação: segments_json → coordinates_utm_json → geometry (local m).
 */
export function getOfficialConfrontationRing(
  block: Record<string, unknown>,
  _project?: Record<string, unknown> | null,
): OfficialConfrontationRingResult {
  const label = block.number ?? block.lot ?? block.id;
  const official = parseOfficialSegmentsFromBlock(block, label);
  if (official.length >= 2) {
    const ring = buildUtmRingFromOfficialSegments(official, label);
    if (isUsefulRing(ring)) {
      return { ok: true, ring, source: 'segments_json' };
    }
  }

  const utmRing = ringFromCoordinatesUtmJson(block);
  if (isUsefulRing(utmRing)) {
    return { ok: true, ring: utmRing, source: 'coordinates_utm_json' };
  }

  const localRing = ringFromGeometryLocalMeters(block);
  if (isUsefulRing(localRing)) {
    return { ok: true, ring: localRing, source: 'geometry' };
  }

  return {
    ok: false,
    ring: [],
    source: 'segments_json',
    reason:
      official.length >= 2
        ? 'segments_json inválido'
        : utmRing.length >= 3
          ? 'coordinates_utm_json inválido'
          : 'sem perímetro oficial (segments_json / UTM / geometry)',
  };
}

export function utmRingToClosedCoords(ring: [number, number][]): number[][] {
  if (!Array.isArray(ring) || ring.length < 3) return [];
  const out: number[][] = [];
  for (const pt of ring) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    out.push([Number(pt[0]), Number(pt[1])]);
  }
  if (out.length < 3) return [];
  const first = out[0];
  const last = out[out.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    out.push([first[0], first[1]]);
  }
  return out;
}

/** Distância euclidiana em metros (coordenadas UTM: [east, north]). */
export function planarDistanceM(
  a: number[],
  b: number[],
): number {
  const dx = Number(b[0]) - Number(a[0]);
  const dy = Number(b[1]) - Number(a[1]);
  return Math.hypot(dx, dy);
}

/** Azimute 0–360° a partir do Norte (x=east, y=north). */
export function planarBearingDeg(
  start: number[],
  end: number[],
): number {
  const dx = Number(end[0]) - Number(start[0]);
  const dy = Number(end[1]) - Number(start[1]);
  let brng = (Math.atan2(dx, dy) * 180) / Math.PI;
  return (brng + 360) % 360;
}
