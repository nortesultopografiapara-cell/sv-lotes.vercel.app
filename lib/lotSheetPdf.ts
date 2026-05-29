/**
 * Prancha técnica do lote — layout referência "Quadra 01 Lote 14" (A4 retrato).
 */

import { jsPDF } from 'jspdf';
import type { LotSheetPayload } from '@/lib/lotSheetData';

export type GenerateLotSheetPdfInput = LotSheetPayload;

const RED: [number, number, number] = [200, 30, 30];
const BLUE: [number, number, number] = [30, 80, 180];
const BLACK: [number, number, number] = [0, 0, 0];

const MARGIN = 6;
const FOOTER_RATIO = 0.22;

function formatScaleLabel(label: string): string {
  const m = String(label).match(/1\s*[:/]\s*(\d+)/i);
  return m ? `1 / ${m[1]}` : label;
}

function centroid(pts: [number, number][]): [number, number] {
  let sx = 0,
    sy = 0;
  const n = pts.length || 1;
  for (const [x, y] of pts) {
    sx += x;
    sy += y;
  }
  return [sx / n, sy / n];
}

function projectRingToSheet(
  localRing: [number, number][],
  bbox: { minX: number; maxX: number; minY: number; maxY: number },
  box: { x: number; y: number; w: number; h: number },
): [number, number][] {
  const width = bbox.maxX - bbox.minX || 1;
  const height = bbox.maxY - bbox.minY || 1;
  const pad = 14;
  const availW = box.w - pad * 2;
  const availH = box.h - pad * 2;
  const scale = Math.min(availW / width, availH / height);
  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;

  return localRing.map(([lx, ly]) => [
    box.x + box.w / 2 + (lx - cx) * scale,
    box.y + box.h / 2 - (ly - cy) * scale,
  ]);
}

function edgeOutwardLabelPos(
  p1: [number, number],
  p2: [number, number],
  center: [number, number],
  offsetMm: number,
): { x: number; y: number; angle: number } {
  const mx = (p1[0] + p2[0]) / 2;
  const my = (p1[1] + p2[1]) / 2;
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  const vx = mx + nx * offsetMm - center[0];
  const vy = my + ny * offsetMm - center[1];
  if (vx * nx + vy * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return { x: mx + nx * offsetMm, y: my + ny * offsetMm, angle };
}

function drawCompassRose(doc: jsPDF, cx: number, cy: number, r: number) {
  doc.setDrawColor(...BLACK);
  doc.setFillColor(255, 255, 255);
  doc.setLineWidth(0.25);
  doc.circle(cx, cy, r, 'S');
  doc.line(cx, cy - r, cx, cy + r);
  doc.line(cx - r, cy, cx + r, cy);
  doc.setFillColor(...BLACK);
  doc.triangle(cx, cy - r, cx - 2.5, cy - r + 5, cx + 2.5, cy - r + 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...BLACK);
  doc.text('N', cx - 2, cy - r - 2);
}

/** Remove vértice duplicado de fechamento e pontos colapsados (mm). */
function preparePolygonVertices(points: [number, number][]): [number, number][] {
  if (points.length < 2) return points;

  const eps = 0.05;
  const verts: [number, number][] = [];

  for (const p of points) {
    const last = verts[verts.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > eps) {
      verts.push(p);
    }
  }

  if (verts.length > 2) {
    const first = verts[0];
    const last = verts[verts.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= eps) {
      verts.pop();
    }
  }

  return verts.length >= 3 ? verts : points;
}

/**
 * Contorno do lote — sempre traço preto via line() (path() do jsPDF falha em vários builds).
 */
function drawLotPolygon(doc: jsPDF, points: [number, number][]): [number, number][] {
  const verts = preparePolygonVertices(points);

  console.log('LOT_SHEET_DRAW_POLYGON_POINTS', {
    inputCount: points.length,
    vertexCount: verts.length,
    vertices: verts,
  });

  if (verts.length < 3) {
    console.warn('LOT_SHEET_DRAW_POLYGON_SKIP', { vertexCount: verts.length });
    return verts;
  }

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.6);
  doc.setFillColor(255, 255, 255);

  for (let i = 0; i < verts.length; i++) {
    const [x1, y1] = verts[i];
    const [x2, y2] = verts[(i + 1) % verts.length];
    doc.line(x1, y1, x2, y2);
  }

  console.log('LOT_SHEET_DRAW_POLYGON_SUCCESS', {
    edges: verts.length,
    closed: true,
  });

  return verts;
}

function drawEdgeMeasures(
  doc: jsPDF,
  points: [number, number][],
  measures: string[],
) {
  const c = centroid(points);
  const n = Math.min(points.length, measures.length);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...BLACK);

  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const label = measures[i];
    if (!label || label === '—') continue;
    const { x, y, angle } = edgeOutwardLabelPos(p1, p2, c, 5);
    doc.text(label, x, y, {
      align: 'center',
      angle: angle > 90 || angle < -90 ? angle + 180 : angle,
    });
  }
}

function drawAreaCenter(
  doc: jsPDF,
  points: [number, number][],
  areaText: string,
) {
  const c = centroid(points);
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  const vertical = spanY > spanX * 1.1;

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BLUE);
  const fontSize = vertical ? 16 : 14;
  doc.setFontSize(fontSize);

  if (vertical) {
    doc.text(areaText, c[0], c[1], {
      align: 'center',
      angle: 90,
    });
  } else {
    doc.text(areaText, c[0], c[1], { align: 'center' });
  }
  doc.setTextColor(...BLACK);
}

/** Círculo vermelho com número do lote (topo do desenho = menor Y). */
function drawLotNumberBadge(
  doc: jsPDF,
  points: [number, number][],
  lotNum: string,
) {
  let best: [number, number] = points[0];
  let minY = points[0][1];
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const my = (p1[1] + p2[1]) / 2;
    if (my < minY) {
      minY = my;
      best = [(p1[0] + p2[0]) / 2, my];
    }
  }
  const [bx, by] = best;
  const r = 5;
  doc.setDrawColor(...RED);
  doc.setFillColor(255, 255, 255);
  doc.setLineWidth(0.5);
  doc.circle(bx, by - r - 2, r, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...RED);
  doc.text(lotNum, bx, by - r - 1.5, { align: 'center' });
  doc.setTextColor(...BLACK);
}

function placeNeighborLabels(
  doc: jsPDF,
  points: [number, number][],
  neighbors: { label: string }[],
) {
  if (!points.length || !neighbors.length) return;

  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const c = centroid(points);

  const slots: Array<{ x: number; y: number; angle: number }> = [
    { x: minX - 10, y: c[1], angle: 90 },
    { x: maxX + 10, y: c[1], angle: 90 },
    { x: c[0], y: maxY + 8, angle: 0 },
    { x: c[0], y: minY - 8, angle: 0 },
  ];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...RED);

  neighbors.slice(0, 4).forEach((n, i) => {
    const slot = slots[i] || slots[0];
    const text = n.label.replace(/^Lote\s*/i, 'Lote ');
    doc.text(text, slot.x, slot.y, {
      align: 'center',
      angle: slot.angle,
    });
  });
  doc.setTextColor(...BLACK);
}

function drawFooterGrid(
  doc: jsPDF,
  pageW: number,
  footerY: number,
  footerH: number,
  data: {
    projectName: string;
    owner: string;
    municipioUf: string;
    matricula: string;
    cri: string;
    comarcaUf: string;
    lotNum: string;
    quadra: string;
    area: string;
    scale: string;
    date: string;
    techName: string;
    techLine: string;
  },
) {
  const x0 = MARGIN;
  const w = pageW - MARGIN * 2;
  const h = footerH;

  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.35);
  doc.rect(x0, footerY, w, h);

  const leftW = w * 0.52;
  const rightW = w - leftW;
  doc.line(x0 + leftW, footerY, x0 + leftW, footerY + h);

  const rowH = h / 6;
  let y = footerY + 4;

  const label = (lx: number, ly: number, text: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...BLACK);
    doc.text(text, lx, ly);
  };

  label(x0 + 2, y, `EMPREENDIMENTO: ${data.projectName}`, true);
  y += rowH * 0.85;
  label(x0 + 2, y, `Proprietário: ${data.owner}`);
  y += rowH * 0.85;
  label(x0 + 2, y, `MUNICÍPIO - UF: ${data.municipioUf}`);
  y += rowH * 0.85;
  label(x0 + 2, y, `MATRÍCULA: ${data.matricula === '—' ? '' : data.matricula}`);
  y += rowH * 0.85;
  label(x0 + 2, y, `CRI: ${data.cri}`);
  y += rowH * 0.85;
  label(x0 + 2, y, `COMARCA - UF: ${data.comarcaUf}`);

  const rx = x0 + leftW + 2;
  const colW = rightW / 3;
  const r1y = footerY + 5;
  label(rx, r1y, `LOTE: ${data.lotNum}`, true);
  label(rx + colW, r1y, `QUADRA: ${data.quadra}`, true);
  label(rx + colW * 2, r1y, `ÁREA: ${data.area}`, true);

  const r2y = footerY + h * 0.38;
  label(rx, r2y, `ESCALA: ${data.scale}`, true);
  label(rx + colW * 1.2, r2y, `DATA: ${data.date}`, true);

  const boxY = footerY + h * 0.55;
  const boxH = h * 0.4;
  doc.rect(rx, boxY, rightW - 4, boxH);
  label(rx + 2, boxY + 5, 'RESPONSÁVEL TÉCNICO:', true);
  label(rx + 2, boxY + 11, data.techName);
  if (data.techLine) {
    label(rx + 2, boxY + 17, data.techLine);
  }
}

/**
 * Gera PDF A4 retrato no padrão da planta de referência.
 */
export function generateLotSheetPdf(input: GenerateLotSheetPdfInput): jsPDF {
  console.log('LOT_SHEET_PDF_GENERATED', {
    lot: input.lot.id,
    project: input.project.name,
    layout: 'portrait_reference',
  });

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.4);
  doc.rect(MARGIN, MARGIN, pageW - MARGIN * 2, pageH - MARGIN * 2);

  const footerH = pageH * FOOTER_RATIO;
  const drawArea = {
    x: MARGIN + 4,
    y: MARGIN + 4,
    w: pageW - (MARGIN + 4) * 2,
    h: pageH - MARGIN * 2 - footerH - 4,
  };
  const footerY = MARGIN + 4 + drawArea.h;

  const project = input.project;
  const lot = input.lot;
  const tech = input.technicalResponsible;

  const lotNum = String(lot.number || lot.lot || '—');
  const quadra = String(lot.block_name || lot.block || lot.quadra || '—');
  const projectName = String(project.name || '—').toUpperCase();
  const municipio = String(project.municipio || project.city || '—');
  const uf = String(project.uf || project.state || '—');
  const municipioUf = `${municipio} - ${uf}`.toUpperCase();
  const comarca = String(project.comarca || project.forum_city || municipio);
  const comarcaUf = `${comarca} - ${uf}`.toUpperCase();
  const matricula = String(project.matricula || '—');
  const criRaw = String(project.cri_cartorio || '—');
  const cri = criRaw !== '—' ? `(${criRaw})` : '';
  const techName = String(tech?.name || '—').toUpperCase();
  const techTitle = String(tech?.title || '').toUpperCase();
  const regType = String(tech?.registry_type || 'CFT').toUpperCase();
  const regNum = String(tech?.registry_number || '—');
  const techLine = [
    techTitle,
    regNum !== '—' ? `${regType}: ${regNum}` : '',
  ]
    .filter(Boolean)
    .join(' | ');

  const sheetPtsRaw = projectRingToSheet(
    input.geometry.localRing,
    input.geometry.bboxMeters,
    drawArea,
  );

  const sheetPts = drawLotPolygon(doc, sheetPtsRaw);

  const edgeMeasures = [
    input.measures.frente,
    input.measures.ladoDireito,
    input.measures.fundo,
    input.measures.ladoEsquerdo,
  ];

  drawEdgeMeasures(doc, sheetPts, edgeMeasures);
  drawAreaCenter(doc, sheetPts, input.measures.area);
  drawLotNumberBadge(doc, sheetPts, lotNum);
  placeNeighborLabels(doc, sheetPts, input.neighbors);

  drawCompassRose(
    doc,
    drawArea.x + drawArea.w - 14,
    drawArea.y + 14,
    7,
  );

  drawFooterGrid(doc, pageW, footerY, footerH - 2, {
    projectName,
    owner: String(input.owner || '—').toUpperCase(),
    municipioUf,
    matricula: matricula === '—' ? '' : matricula,
    cri,
    comarcaUf,
    lotNum,
    quadra,
    area: input.measures.area,
    scale: formatScaleLabel(input.scaleLabel),
    date: new Date().toLocaleDateString('pt-BR'),
    techName,
    techLine,
  });

  return doc;
}

export function lotSheetPdfToBlob(doc: jsPDF): Blob {
  return doc.output('blob');
}

export function downloadLotSheetPdf(doc: jsPDF, filename: string) {
  doc.save(filename);
}

export function openLotSheetPdfPreview(doc: jsPDF) {
  const blob = lotSheetPdfToBlob(doc);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
