/**
 * Prancha técnica do lote — layout Métrica Topo (A4 retrato).
 */

import { jsPDF } from 'jspdf';
import type { LotSheetPayload } from '@/lib/lotSheetData';
import type {
  LotSheetBlockSketch,
  LotSheetMetricRow,
} from '@/lib/lotSheetEnrichment';
import {
  loadImageAsBase64,
  loadReportHeaderLogoBase64,
} from '@/lib/reportBranding';

export type GenerateLotSheetPdfInput = LotSheetPayload;

const BLACK: [number, number, number] = [0, 0, 0];
const RED: [number, number, number] = [200, 30, 30];
const BLUE: [number, number, number] = [30, 80, 180];
const HIGHLIGHT: [number, number, number] = [251, 146, 60];

const MARGIN = 5;

type Box = { x: number; y: number; w: number; h: number };

function formatScaleLabel(label: string): string {
  const m = String(label).match(/1\s*[:/]\s*(\d+)/i);
  return m ? `1 / ${m[1]}` : label;
}

function parseScaleDenom(label: string): number {
  const m = String(label).match(/1\s*[:/]\s*(\d+)/i);
  return m?.[1] ? Number(m[1]) || 500 : 500;
}

function centroid(pts: [number, number][]): [number, number] {
  let sx = 0;
  let sy = 0;
  const n = pts.length || 1;
  for (const [x, y] of pts) {
    sx += x;
    sy += y;
  }
  return [sx / n, sy / n];
}

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

function projectRingToSheet(
  localRing: [number, number][],
  bbox: { minX: number; maxX: number; minY: number; maxY: number },
  box: Box,
): [number, number][] {
  const width = bbox.maxX - bbox.minX || 1;
  const height = bbox.maxY - bbox.minY || 1;
  const pad = 14;
  const scale = Math.min(
    (box.w - pad * 2) / width,
    (box.h - pad * 2) / height,
  );
  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;

  return localRing.map(([lx, ly]) => [
    box.x + box.w / 2 + (lx - cx) * scale,
    box.y + box.h / 2 - (ly - cy) * scale,
  ]);
}

function projectRingsToBox(
  items: { localRing: [number, number][] }[],
  bbox: { minX: number; maxX: number; minY: number; maxY: number },
  box: Box,
): Map<string, [number, number][]> {
  const width = bbox.maxX - bbox.minX || 1;
  const height = bbox.maxY - bbox.minY || 1;
  const pad = 4;
  const scale = Math.min(
    (box.w - pad * 2) / width,
    (box.h - pad * 2) / height,
  );
  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;
  const out = new Map<string, [number, number][]>();

  items.forEach((item, idx) => {
    const pts = item.localRing.map(
      ([lx, ly]) =>
        [
          box.x + box.w / 2 + (lx - cx) * scale,
          box.y + box.h / 2 - (ly - cy) * scale,
        ] as [number, number],
    );
    out.set(String(idx), pts);
  });
  return out;
}

function drawPolygonLines(
  doc: jsPDF,
  points: [number, number][],
  opts: {
    fill?: [number, number, number];
    stroke?: [number, number, number];
    lw?: number;
  },
) {
  const verts = preparePolygonVertices(points);
  if (verts.length < 3) return;
  doc.setDrawColor(...(opts.stroke || BLACK));
  doc.setLineWidth(opts.lw ?? 0.45);
  doc.setFillColor(...(opts.fill || [255, 255, 255]));
  for (let i = 0; i < verts.length; i++) {
    const [x1, y1] = verts[i];
    const [x2, y2] = verts[(i + 1) % verts.length];
    doc.line(x1, y1, x2, y2);
  }
}

function drawLotPolygon(doc: jsPDF, points: [number, number][]): [number, number][] {
  const verts = preparePolygonVertices(points);
  if (verts.length < 3) return verts;
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.65);
  doc.setFillColor(255, 255, 255);
  for (let i = 0; i < verts.length; i++) {
    const [x1, y1] = verts[i];
    const [x2, y2] = verts[(i + 1) % verts.length];
    doc.line(x1, y1, x2, y2);
  }
  return verts;
}

function edgeLengthsFromRing(localRing: [number, number][]): string[] {
  const verts = preparePolygonVertices(localRing);
  const out: string[] = [];
  for (let i = 0; i < verts.length; i++) {
    const p1 = verts[i];
    const p2 = verts[(i + 1) % verts.length];
    const d = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    out.push(
      `${d.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`,
    );
  }
  return out;
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

function drawEdgeMeasures(
  doc: jsPDF,
  points: [number, number][],
  measures: string[],
) {
  const c = centroid(points);
  const n = Math.min(points.length, measures.length);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...BLACK);
  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const label = measures[i];
    if (!label || label === '—') continue;
    const { x, y, angle } = edgeOutwardLabelPos(p1, p2, c, 6);
    doc.text(label, x, y, {
      align: 'center',
      angle: angle > 90 || angle < -90 ? angle + 180 : angle,
    });
  }
}

function drawVertexMarkers(doc: jsPDF, points: [number, number][]) {
  const verts = preparePolygonVertices(points);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(...BLACK);
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.25);
  verts.forEach((p, i) => {
    doc.circle(p[0], p[1], 0.9, 'S');
    doc.text(`M-${String(i + 1).padStart(2, '0')}`, p[0] + 2.2, p[1] - 1.2);
  });
}

function placeSideConfrontantLabels(
  doc: jsPDF,
  points: [number, number][],
  sides: {
    frente: string;
    fundo: string;
    ladoDireito: string;
    ladoEsquerdo: string;
  },
) {
  if (!points.length) return;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const c = centroid(points);

  const slots = [
    { value: sides.frente, x: c[0], y: minY - 9, angle: 0 },
    { value: sides.fundo, x: c[0], y: maxY + 9, angle: 0 },
    { value: sides.ladoDireito, x: maxX + 11, y: c[1], angle: 90 },
    { value: sides.ladoEsquerdo, x: minX - 11, y: c[1], angle: 90 },
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...BLACK);

  for (const slot of slots) {
    if (!slot.value || slot.value === '—') continue;
    doc.text(slot.value, slot.x, slot.y, {
      align: 'center',
      angle: slot.angle,
      maxWidth: 48,
    });
  }
}

function drawAreaCenter(doc: jsPDF, points: [number, number][], areaText: string) {
  const c = centroid(points);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BLUE);
  doc.setFontSize(13);
  doc.text(areaText, c[0], c[1], { align: 'center' });
  doc.setTextColor(...BLACK);
}

function drawLotNumberBadge(doc: jsPDF, points: [number, number][], lotNum: string) {
  const c = centroid(points);
  const r = 5.5;
  doc.setDrawColor(...BLACK);
  doc.setFillColor(255, 255, 255);
  doc.setLineWidth(0.45);
  doc.circle(c[0], c[1], r, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...BLACK);
  doc.text(lotNum, c[0], c[1] + 1.2, { align: 'center' });
}

function drawCompassRose(doc: jsPDF, cx: number, cy: number, r: number) {
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.2);
  doc.setFillColor(255, 255, 255);
  doc.circle(cx, cy, r, 'S');
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const x2 = cx + Math.cos(a) * r;
    const y2 = cy + Math.sin(a) * r;
    doc.line(cx, cy, x2, y2);
  }
  doc.setFillColor(...BLACK);
  doc.triangle(
    cx,
    cy - r,
    cx - 2.8,
    cy - r + 6,
    cx + 2.8,
    cy - r + 6,
    'F',
  );
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('N', cx - 2.2, cy - r - 2.5);
}

function drawMetricTable(
  doc: jsPDF,
  box: Box,
  rows: LotSheetMetricRow[],
) {
  const headers = ['De', 'Para', 'Azimute', 'Distância', 'Coord. E(X)', 'Coord. N(Y)'];
  const colWidths = [
    box.w * 0.08,
    box.w * 0.08,
    box.w * 0.18,
    box.w * 0.14,
    box.w * 0.26,
    box.w * 0.26,
  ];
  const rowH = 4.2;
  const headerH = 5;

  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.25);
  doc.rect(box.x, box.y, box.w, box.h);

  let x = box.x;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  headers.forEach((h, i) => {
    doc.rect(x, box.y, colWidths[i], headerH);
    doc.text(h, x + colWidths[i] / 2, box.y + 3.5, { align: 'center' });
    x += colWidths[i];
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  const maxRows = Math.min(
    rows.length,
    Math.floor((box.h - headerH) / rowH),
  );
  for (let ri = 0; ri < maxRows; ri++) {
    const row = rows[ri];
    const y = box.y + headerH + ri * rowH;
    x = box.x;
    const cells = [
      row.from,
      row.to,
      row.azimute,
      row.distancia,
      row.coordE,
      row.coordN,
    ];
    cells.forEach((cell, ci) => {
      doc.rect(x, y, colWidths[ci], rowH);
      doc.text(cell, x + colWidths[ci] / 2, y + 2.9, {
        align: 'center',
        maxWidth: colWidths[ci] - 1,
      });
      x += colWidths[ci];
    });
  }
}

function drawGraphicScale(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  scaleDenom: number,
) {
  const barRealM = 50;
  const barMm = Math.min(w * 0.55, (barRealM * 1000) / scaleDenom);
  const segments = 5;
  const segMm = barMm / segments;
  const segM = barRealM / segments;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.text('Escala Gráfica:', x, y);

  const barX = x + 28;
  const barY = y - 1.5;
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.35);
  doc.setFillColor(255, 255, 255);

  for (let i = 0; i < segments; i++) {
    if (i % 2 === 0) doc.setFillColor(255, 255, 255);
    else doc.setFillColor(40, 40, 40);
    doc.rect(barX + i * segMm, barY, segMm, 3, 'FD');
  }
  doc.setDrawColor(...BLACK);
  doc.rect(barX, barY, barMm, 3, 'S');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  doc.setTextColor(...BLACK);
  for (let i = 0; i <= segments; i++) {
    const label = String(Math.round(i * segM));
    doc.text(label, barX + i * segMm, barY + 5.5, { align: 'center' });
  }
  doc.text('m', barX + barMm + 3, barY + 1.5);
}

function drawQuadraLocation(
  doc: jsPDF,
  box: Box,
  sketch: LotSheetBlockSketch | null,
  streetNames: string[],
) {
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.3);
  doc.rect(box.x, box.y, box.w, box.h);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(5);
  doc.text('LOCALIZAÇÃO NA QUADRA (sem escala)', box.x + 2, box.y + 4);

  const inner: Box = {
    x: box.x + 3,
    y: box.y + 6,
    w: box.w - 6,
    h: box.h - 9,
  };

  if (!sketch?.lots.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.text('Croqui da quadra indisponível', inner.x + inner.w / 2, inner.y + inner.h / 2, {
      align: 'center',
    });
    return;
  }

  const projected = projectRingsToBox(sketch.lots, sketch.bbox, inner);
  sketch.lots.forEach((lot, idx) => {
    const pts = projected.get(String(idx));
    if (!pts) return;
    drawPolygonLines(doc, pts, {
      fill: lot.isSelected ? HIGHLIGHT : [255, 255, 255],
      stroke: BLACK,
      lw: lot.isSelected ? 0.55 : 0.3,
    });
    if (lot.isSelected) {
      const c = centroid(pts);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.text(lot.number, c[0], c[1] + 1, { align: 'center' });
    }
  });

  const streets = streetNames.filter(Boolean);
  if (streets.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(4.5);
    if (streets[0]) {
      doc.text(streets[0], inner.x + inner.w / 2, inner.y - 0.5, {
        align: 'center',
        maxWidth: inner.w,
      });
    }
    if (streets[1]) {
      doc.text(streets[1], inner.x + inner.w / 2, inner.y + inner.h + 2, {
        align: 'center',
        maxWidth: inner.w,
      });
    }
    if (streets[2]) {
      doc.text(streets[2], inner.x - 1, inner.y + inner.h / 2, {
        align: 'right',
        angle: 90,
        maxWidth: inner.h,
      });
    }
    if (streets[3]) {
      doc.text(streets[3], inner.x + inner.w + 1, inner.y + inner.h / 2, {
        align: 'left',
        angle: 90,
        maxWidth: inner.h,
      });
    }
  }

  drawCompassRose(doc, box.x + box.w - 8, box.y + 8, 3.5);
}

async function loadOptionalImage(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    return await loadImageAsBase64(url);
  } catch {
    return null;
  }
}

function drawMetricTopoFooter(
  doc: jsPDF,
  box: Box,
  data: {
    projectName: string;
    owner: LotSheetPayload['ownerDetails'];
    lotNum: string;
    quadra: string;
    area: string;
    scale: string;
    date: string;
    techName: string;
    techTitle: string;
    cft: string;
    trt: string;
    logoBase64: string | null;
    signatureBase64: string | null;
  },
) {
  const { x, y, w, h } = box;
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.35);
  doc.rect(x, y, w, h);

  const leftW = w * 0.58;
  doc.line(x + leftW, y, x + leftW, y + h);

  const label = (lx: number, ly: number, text: string, bold = false, size = 6) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...BLACK);
    doc.text(text, lx, ly, { maxWidth: leftW - 6 });
  };

  let ly = y + 4;
  if (data.logoBase64) {
    try {
      doc.addImage(data.logoBase64, 'PNG', x + 2, y + 2, 16, 8);
      ly = y + 12;
    } catch {
      /* ignore */
    }
  }

  label(x + 2, ly, `EMPREENDIMENTO: ${data.projectName}`, true);
  ly += 4.2;
  label(x + 2, ly, `LOTE: ${data.lotNum}`);
  ly += 4;
  label(x + 2, ly, `PROPRIETÁRIO: ${data.owner.name}`);
  ly += 4;
  label(x + 2, ly, `CPF: ${data.owner.cpf}`);
  ly += 4;
  label(x + 2, ly, `NOME DO PAI: ${data.owner.fatherName}`);
  ly += 4;
  label(x + 2, ly, `NOME DA MÃE: ${data.owner.motherName}`);
  ly += 4;
  label(x + 2, ly, `ENDEREÇO: ${data.owner.address}`);
  ly += 4;
  label(x + 2, ly, `BAIRRO: ${data.owner.neighborhood}`);
  ly += 4;
  if (data.owner.cadastralInscription !== '—') {
    label(x + 2, ly, `INSCRIÇÃO CADASTRAL: ${data.owner.cadastralInscription}`);
    ly += 4;
  }
  label(x + 2, ly, `MUNICÍPIO: ${data.owner.municipality}`);

  const rx = x + leftW + 2;
  const rw = w - leftW - 4;
  const col = rw / 3;

  label(rx, y + 5, `LOTE: ${data.lotNum}`, true);
  label(rx + col, y + 5, `QUADRA: ${data.quadra}`, true);
  label(rx + col * 2, y + 5, `ÁREA: ${data.area}`, true);
  label(rx, y + 10, `ESCALA: ${data.scale}`, true);
  label(rx + col * 1.15, y + 10, `DATA: ${data.date}`, true);

  const techBoxY = y + 14;
  const techBoxH = h - 16;
  doc.rect(rx, techBoxY, rw, techBoxH);
  label(rx + 2, techBoxY + 4, 'RESP. TÉC.:', true);

  let ty = techBoxY + 9;
  if (data.signatureBase64) {
    try {
      doc.addImage(data.signatureBase64, 'PNG', rx + 2, techBoxY + 5, 24, 9);
      ty = techBoxY + 15;
    } catch {
      /* ignore */
    }
  }

  label(rx + 2, ty, data.techName, false, 5.5);
  if (data.techTitle) label(rx + 2, ty + 4, data.techTitle, false, 5);
  const regLine = `${data.techName}, ${data.techTitle || 'Responsável Técnico'}, CFT: ${data.cft}${data.trt !== '—' ? `, TRT: ${data.trt}` : ''}`;
  label(rx + 2, y + h - 3, regLine, false, 4.5);
}

/**
 * Gera PDF A4 retrato no padrão Métrica Topo.
 */
export async function generateLotSheetPdf(
  input: GenerateLotSheetPdfInput,
): Promise<jsPDF> {
  console.log('LOT_SHEET_PDF_GENERATED', {
    lot: input.lot.id,
    layout: 'metrica_topo_a4',
  });

  const company = input.company;
  const tech = input.technicalResponsible;
  const logoBase64 = await loadReportHeaderLogoBase64(
    (company?.logo_url as string) || null,
  );
  const signatureBase64 = await loadOptionalImage(
    tech?.signature_url as string | undefined,
  );

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const innerX = MARGIN;
  const innerY = MARGIN;
  const innerW = pageW - MARGIN * 2;
  const innerH = pageH - MARGIN * 2;

  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.4);
  doc.rect(innerX, innerY, innerW, innerH);

  const footerH = 46;
  const locationH = 36;
  const scaleBandH = 9;
  const tableRowH = 4.2;
  const tableHeaderH = 5;
  const tableRows = Math.max(3, Math.min(input.metricRows.length, 8));
  const tableH = tableHeaderH + tableRows * tableRowH + 2;
  const gap = 2;
  const contentX = innerX + 3;
  const contentW = innerW - 6;

  const footerBox: Box = {
    x: contentX,
    y: innerY + innerH - footerH - 2,
    w: contentW,
    h: footerH,
  };

  const locationBox: Box = {
    x: contentX,
    y: footerBox.y - gap - locationH,
    w: contentW,
    h: locationH,
  };

  const scaleY = locationBox.y - gap - scaleBandH;
  const tableBox: Box = {
    x: contentX,
    y: scaleY - gap - tableH,
    w: contentW,
    h: tableH,
  };

  const mainTopY = innerY + 3;
  const mainTargetH = innerH * 0.65;
  const mainAvailableH = tableBox.y - gap - mainTopY;
  const mainBox: Box = {
    x: contentX,
    y: mainTopY,
    w: contentW,
    h: Math.max(100, Math.min(mainTargetH, mainAvailableH)),
  };

  const project = input.project;
  const lot = input.lot;
  const lotNum = String(lot.number || lot.lot || '—');
  const quadra = String(lot.block_name || lot.block || lot.quadra || '—');
  const projectName = String(project.name || '—').toUpperCase();
  const scaleDenom = parseScaleDenom(input.scaleLabel);

  const sheetPts = drawLotPolygon(
    doc,
    projectRingToSheet(
      input.geometry.localRing,
      input.geometry.bboxMeters,
      mainBox,
    ),
  );

  drawEdgeMeasures(doc, sheetPts, edgeLengthsFromRing(input.geometry.localRing));
  drawVertexMarkers(doc, sheetPts);
  drawAreaCenter(doc, sheetPts, input.measures.area);
  drawLotNumberBadge(doc, sheetPts, lotNum);
  placeSideConfrontantLabels(doc, sheetPts, input.sideConfrontants);
  drawCompassRose(doc, mainBox.x + mainBox.w - 11, mainBox.y + 11, 7);

  drawMetricTable(doc, tableBox, input.metricRows);
  drawGraphicScale(doc, contentX, scaleY + 4, contentW, scaleDenom);
  drawQuadraLocation(doc, locationBox, input.blockSketch, input.quadraStreetNames);

  const techName = String(tech?.name || '').trim() || 'Não informado';
  const techTitle = String(tech?.title || '').trim();
  const cft = String(tech?.registry_number || '').trim() || 'Não informado';
  const trt =
    String(tech?.trt || tech?.art_number || tech?.trt_number || '').trim() || '—';

  drawMetricTopoFooter(doc, footerBox, {
    projectName,
    owner: input.ownerDetails,
    lotNum,
    quadra,
    area: input.measures.area,
    scale: formatScaleLabel(input.scaleLabel),
    date: new Date().toLocaleDateString('pt-BR'),
    techName: techName.toUpperCase(),
    techTitle: techTitle.toUpperCase(),
    cft,
    trt,
    logoBase64,
    signatureBase64,
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
