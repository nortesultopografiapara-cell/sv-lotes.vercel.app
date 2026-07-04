/**
 * Croqui vetorial esquemático para PDF — Medir Área (SV LOTES GIS).
 * Projeção local em metros; escala uniforme preserva proporção.
 */

import { formatGisAreaM2, formatGisLengthM } from '@/lib/gis/areaMeasure';
import type { GisLatLng } from '@/lib/gis/distanceMeasure';

export const CROQUI_SECTION_TITLE = 'CROQUI DA ÁREA MEDIDA';
export const CROQUI_DISCLAIMER =
  'Representação gráfica esquemática da área medida (sem escala cartográfica definida).';

export type Point2D = { x: number; y: number };

export type AreaMeasureCroquiLayout = {
  sectionTitle: string;
  disclaimer: string;
  areaText: string;
  perimeterText: string;
  /** Pontos do polígono no sistema local do retângulo do croqui (mm). */
  pdfPoints: Point2D[];
  /** Vértices numerados. */
  vertices: { pdf: Point2D; label: string }[];
  /** Medidas centradas em cada lado. */
  sideLabels: { pdf: Point2D; text: string }[];
  /** Escala uniforme (mm por metro local). */
  scale: number;
  /** Retângulo reservado ao croqui (mm). */
  box: { x: number; y: number; width: number; height: number };
  northArrow: { tip: Point2D; baseLeft: Point2D; baseRight: Point2D; label: Point2D };
};

/** Converte WGS84 para plano local aproximado em metros (proporção preservada). */
export function projectGisToLocalMeters(points: GisLatLng[]): Point2D[] {
  if (points.length === 0) return [];
  const refLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const refLng = points.reduce((s, p) => s + p.lng, 0) / points.length;
  const latRad = (refLat * Math.PI) / 180;
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos(latRad);
  return points.map((p) => ({
    x: (p.lng - refLng) * mPerDegLng,
    y: (p.lat - refLat) * mPerDegLat,
  }));
}

export function computeBoundingBoxAspectRatio(points: Point2D[]): number {
  if (points.length === 0) return 1;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const rangeX = Math.max(...xs) - Math.min(...xs) || 1;
  const rangeY = Math.max(...ys) - Math.min(...ys) || 1;
  return rangeX / rangeY;
}

export function fitLocalPointsToBox(
  localPoints: Point2D[],
  box: { x: number; y: number; width: number; height: number; padding?: number },
): { pdfPoints: Point2D[]; scale: number } {
  const pad = box.padding ?? 10;
  const innerW = box.width - pad * 2;
  const innerH = box.height - pad * 2;
  const xs = localPoints.map((p) => p.x);
  const ys = localPoints.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const scale = Math.min(innerW / rangeX, innerH / rangeY);
  const drawnW = rangeX * scale;
  const drawnH = rangeY * scale;
  const offsetX = box.x + pad + (innerW - drawnW) / 2;
  const offsetY = box.y + pad + (innerH - drawnH) / 2;

  const pdfPoints = localPoints.map((p) => ({
    x: offsetX + (p.x - minX) * scale,
    y: offsetY + drawnH - (p.y - minY) * scale,
  }));

  return { pdfPoints, scale };
}

export function buildAreaMeasureCroquiLayout(input: {
  points: GisLatLng[];
  sides: { panelLabel: string; distanceM: number }[];
  areaM2: number;
  perimeterM: number;
  box: { x: number; y: number; width: number; height: number };
}): AreaMeasureCroquiLayout | null {
  if (input.points.length < 3) return null;

  const local = projectGisToLocalMeters(input.points);
  const { pdfPoints, scale } = fitLocalPointsToBox(local, input.box);

  const vertices = pdfPoints.map((pdf, i) => ({
    pdf,
    label: String(i + 1),
  }));

  const n = input.points.length;
  const sideLabels = Array.from({ length: n }, (_, i) => {
    const a = pdfPoints[i];
    const b = pdfPoints[(i + 1) % n];
    const side = input.sides[i];
    return {
      pdf: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      text: side ? formatGisLengthM(side.distanceM) : '—',
    };
  });

  const northX = input.box.x + input.box.width - 12;
  const northY = input.box.y + 8;
  const northArrow = {
    tip: { x: northX, y: northY },
    baseLeft: { x: northX - 3, y: northY + 7 },
    baseRight: { x: northX + 3, y: northY + 7 },
    label: { x: northX, y: northY + 10 },
  };

  return {
    sectionTitle: CROQUI_SECTION_TITLE,
    disclaimer: CROQUI_DISCLAIMER,
    areaText: formatGisAreaM2(input.areaM2),
    perimeterText: formatGisLengthM(input.perimeterM),
    pdfPoints,
    vertices,
    sideLabels,
    scale,
    box: input.box,
    northArrow,
  };
}

export function verifyCroquiAspectRatioPreserved(
  localPoints: Point2D[],
  pdfPoints: Point2D[],
  tolerance = 0.05,
): boolean {
  if (localPoints.length < 2 || pdfPoints.length < 2) return false;
  const localRatio = computeBoundingBoxAspectRatio(localPoints);
  const pdfRatio = computeBoundingBoxAspectRatio(pdfPoints);
  if (!Number.isFinite(localRatio) || !Number.isFinite(pdfRatio)) return false;
  return Math.abs(localRatio - pdfRatio) <= tolerance * Math.max(localRatio, pdfRatio, 1);
}
