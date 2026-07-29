/**
 * Prancha Geral do Empreendimento — PDF vetorial (jsPDF).
 */

import { jsPDF } from 'jspdf';
import {
  buildEnterpriseOverviewLayout,
  ENTERPRISE_LOT_FILL_OPACITY,
  ENTERPRISE_LOT_STROKE_RGB,
  ENTERPRISE_LOT_STROKE_WIDTH_MM,
  type EnterpriseOverviewLayout,
  type EnterpriseOverviewOptions,
  type FitEnterpriseInput,
  projectEnterprisePointToPdf,
  projectGeographicPointToPdf,
  computeEnterpriseMapContentRectMm,
} from '@/lib/enterpriseOverviewLayout';
import {
  buildStreetLabelPlacementsOnSheet,
  rotatedTextOccupiedBox,
  STREET_LABEL_RGB,
  type OccupiedBox,
  type StreetLabelSheetPlacement,
} from '@/lib/enterpriseOverviewStreets';
import { loadImageAsBase64, loadReportHeaderLogoBase64 } from '@/lib/reportBranding';

export {
  ENTERPRISE_LOT_FILL_OPACITY,
  ENTERPRISE_LOT_STROKE_RGB,
  ENTERPRISE_LOT_STROKE_WIDTH_MM,
  computeEnterpriseMapContentRectMm,
  projectGeographicPointToPdf,
};

/** Ordem de desenho do mapa (para testes). */
export const ENTERPRISE_MAP_DRAW_ORDER = [
  'background_white',
  'lot_fills',
  'streets',
  'lot_strokes',
  'lot_numbers',
  'quadra_labels',
  'street_labels',
  'north',
  'graphic_scale',
  'map_frame',
] as const;

export type EnterpriseCompanyInfo = {
  name: string;
  fantasyName: string;
  phone: string;
  email: string;
  website: string;
  instagram: string;
  logoUrl: string;
};

export type EnterpriseOverviewPdfPayload = {
  project: Record<string, unknown>;
  company: EnterpriseCompanyInfo;
  layout: EnterpriseOverviewLayout;
  options: EnterpriseOverviewOptions;
  logoBase64?: string | null;
  generatedAt: string;
};

const BLACK: [number, number, number] = [0, 0, 0];
const GRAY: [number, number, number] = [90, 90, 90];

export function companyFromRecord(
  row: Record<string, unknown> | null | undefined,
): EnterpriseCompanyInfo {
  if (!row) {
    return {
      name: 'Não informado',
      fantasyName: 'Não informado',
      phone: 'Não informado',
      email: 'Não informado',
      website: 'Não informado',
      instagram: 'Não informado',
      logoUrl: '',
    };
  }
  const display = (v: unknown) => {
    const s = String(v ?? '').trim();
    return s || 'Não informado';
  };
  return {
    name: display(row.name ?? row.razao_social),
    fantasyName: display(row.fantasy_name ?? row.name),
    phone: display(row.phone),
    email: display(row.email),
    website: display(row.website ?? row.site ?? row.site_url),
    instagram: display(row.instagram ?? row.instagram_url),
    logoUrl: String(row.logo_url || '').trim(),
  };
}

export function buildEnterpriseOverviewPayload(
  input: FitEnterpriseInput & {
    company: Record<string, unknown> | null | undefined;
    generatedAt?: string;
  },
): EnterpriseOverviewPdfPayload {
  const generatedAt =
    input.generatedAt ?? new Date().toLocaleDateString('pt-BR');
  const layout = buildEnterpriseOverviewLayout(input, generatedAt);
  return {
    project: input.project,
    company: companyFromRecord(input.company),
    layout,
    options: input.options,
    generatedAt,
  };
}

/** Estatísticas do último desenho de lotes no mapa (para testes/diagnóstico). */
export type EnterpriseLotDrawStats = {
  lotsTotal: number;
  fillsDrawn: number;
  strokesDrawn: number;
  skippedInvalidRing: number;
};

let lastEnterpriseLotDrawStats: EnterpriseLotDrawStats | null = null;

export function getLastEnterpriseLotDrawStats(): EnterpriseLotDrawStats | null {
  return lastEnterpriseLotDrawStats;
}

/** Converte anel fechado em deltas relativos para jsPDF.lines(). */
export function ringToLineDeltas(
  points: [number, number][],
): [number, number][] {
  const deltas: [number, number][] = [];
  for (let i = 1; i < points.length; i++) {
    deltas.push([
      points[i][0] - points[i - 1][0],
      points[i][1] - points[i - 1][1],
    ]);
  }
  return deltas;
}

export function isValidPdfRing(points: [number, number][]): boolean {
  if (points.length < 3) return false;
  return points.every(
    ([x, y]) => Number.isFinite(x) && Number.isFinite(y),
  );
}

/** Desenha polígono fechado via jsPDF.lines (API suportada com fill/stroke). */
export function drawClosedPolygonLines(
  doc: jsPDF,
  points: [number, number][],
  style: 'F' | 'S' | 'FD',
): boolean {
  if (!isValidPdfRing(points)) return false;
  const deltas = ringToLineDeltas(points);
  doc.lines(deltas, points[0][0], points[0][1], [1, 1], style, true);
  return true;
}

/** Caminho lógico do polígono — apenas perímetro (M → L… → Z), sem triangulação. */
export function buildClosedPolygonPath(
  points: [number, number][],
): (string | number)[][] {
  if (points.length < 3) return [];
  const path: (string | number)[][] = [['M', points[0][0], points[0][1]]];
  for (let i = 1; i < points.length; i++) {
    path.push(['L', points[i][0], points[i][1]]);
  }
  path.push(['Z']);
  return path;
}

/** Valida que o path não contém diagonais internas (somente arestas do perímetro). */
export function isPerimeterOnlyPolygonPath(
  path: (string | number)[][],
  vertexCount: number,
): boolean {
  if (vertexCount < 3) return false;
  const moves = path.filter((c) => c[0] === 'M').length;
  const lines = path.filter((c) => c[0] === 'L').length;
  const closes = path.filter((c) => c[0] === 'Z').length;
  return moves === 1 && lines === vertexCount - 1 && closes === 1;
}

function applyFillOpacity(doc: jsPDF, opacity: number) {
  doc.setGState(new doc.GState({ opacity }));
}

function resetOpacity(doc: jsPDF) {
  doc.setGState(new doc.GState({ opacity: 1 }));
}

/** Cor de preenchimento visível em fundo branco (simula translucidez sem GState). */
export function blendFillColorForWhiteBackground(
  rgb: [number, number, number],
  opacity = ENTERPRISE_LOT_FILL_OPACITY,
): [number, number, number] {
  return [
    Math.round(rgb[0] * opacity + 255 * (1 - opacity)),
    Math.round(rgb[1] * opacity + 255 * (1 - opacity)),
    Math.round(rgb[2] * opacity + 255 * (1 - opacity)),
  ];
}

/** Apenas preenchimento — GState 50% + cor por status. */
export function drawLotFillOnly(
  doc: jsPDF,
  points: [number, number][],
  fill: [number, number, number],
  _opts?: { onSatellite?: boolean },
): boolean {
  if (!isValidPdfRing(points)) return false;
  applyFillOpacity(doc, ENTERPRISE_LOT_FILL_OPACITY);
  doc.setFillColor(...fill);
  const ok = drawClosedPolygonLines(doc, points, 'F');
  resetOpacity(doc);
  return ok;
}

/** Contorno 100% opaco — ciano #00E5FF, sem GState de fill. */
export function drawLotStrokeOnly(
  doc: jsPDF,
  points: [number, number][],
  lw = ENTERPRISE_LOT_STROKE_WIDTH_MM,
): boolean {
  if (!isValidPdfRing(points)) return false;
  resetOpacity(doc);
  doc.setDrawColor(...ENTERPRISE_LOT_STROKE_RGB);
  doc.setLineWidth(lw);
  doc.setLineCap('round');
  doc.setLineJoin('round');
  return drawClosedPolygonLines(doc, points, 'S');
}

/** Preenchimento 50% de todos os lotes no mapa. */
export function drawEnterpriseLotFillsOnMap(
  doc: jsPDF,
  layout: EnterpriseOverviewLayout,
): number {
  let drawn = 0;
  for (const lot of layout.lots) {
    const pts = lot.ring.map((p) => projectEnterprisePointToPdf(p, layout));
    if (drawLotFillOnly(doc, pts, lot.fillRgb)) drawn++;
  }
  return drawn;
}

/** Divisas ciano de todos os lotes — chamar após ruas. */
export function drawEnterpriseLotStrokesOnMap(
  doc: jsPDF,
  layout: EnterpriseOverviewLayout,
): number {
  let drawn = 0;
  for (const lot of layout.lots) {
    const pts = lot.ring.map((p) => projectEnterprisePointToPdf(p, layout));
    if (drawLotStrokeOnly(doc, pts)) drawn++;
  }
  return drawn;
}

/** Desenha fills + strokes e registra estatísticas (fills antes, strokes depois das ruas). */
export function drawEnterpriseLotsOnMap(
  doc: jsPDF,
  layout: EnterpriseOverviewLayout,
  phase: 'fills' | 'strokes',
): EnterpriseLotDrawStats {
  const base = lastEnterpriseLotDrawStats ?? {
    lotsTotal: layout.lots.length,
    fillsDrawn: 0,
    strokesDrawn: 0,
    skippedInvalidRing: 0,
  };

  if (phase === 'fills') {
    const fillsDrawn = drawEnterpriseLotFillsOnMap(doc, layout);
    const skippedInvalidRing = layout.lots.length - fillsDrawn;
    lastEnterpriseLotDrawStats = {
      lotsTotal: layout.lots.length,
      fillsDrawn,
      strokesDrawn: 0,
      skippedInvalidRing,
    };
    if (fillsDrawn === 0 && layout.lots.length > 0) {
      console.warn('ENTERPRISE_OVERVIEW_NO_LOT_FILLS_DRAWN', lastEnterpriseLotDrawStats);
    }
    return lastEnterpriseLotDrawStats;
  }

  const strokesDrawn = drawEnterpriseLotStrokesOnMap(doc, layout);
  lastEnterpriseLotDrawStats = {
    ...base,
    lotsTotal: layout.lots.length,
    strokesDrawn,
    skippedInvalidRing: Math.max(
      base.skippedInvalidRing,
      layout.lots.length - strokesDrawn,
    ),
  };
  if (strokesDrawn === 0 && layout.lots.length > 0) {
    console.warn('ENTERPRISE_OVERVIEW_NO_LOT_STROKES_DRAWN', lastEnterpriseLotDrawStats);
  }
  return lastEnterpriseLotDrawStats;
}

/** Stream PDF bruto para validação de operadores gráficos. */
export function enterpriseOverviewPdfRawStream(doc: jsPDF): string {
  return Buffer.from(doc.output('arraybuffer')).toString('latin1');
}

/** Conta operadores de preenchimento e traço no stream PDF. */
export function countPdfPaintOperators(stream: string): {
  fills: number;
  strokes: number;
  cyanStrokeRgb: boolean;
  strokeWidth07: boolean;
} {
  const fills = (stream.match(/\sf[\s\n]/g) ?? []).length;
  const strokes = (stream.match(/\sS[\s\n]/g) ?? []).length;
  const cyanStrokeRgb = /0\.\s*0\.9\s+1\.\s+RG/.test(stream);
  const strokeWidthPt =
    ENTERPRISE_LOT_STROKE_WIDTH_MM * (72 / 25.4);
  const strokeWidth07 =
    stream.includes(`${strokeWidthPt} w`) ||
    /1\.98\d* w/.test(stream);
  return { fills, strokes, cyanStrokeRgb, strokeWidth07 };
}

function drawTextWithHalo(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  opts: {
    fontSize: number;
    align?: 'left' | 'center' | 'right';
    bold?: boolean;
    angle?: number;
    color?: [number, number, number];
  },
) {
  const align = opts.align ?? 'center';
  const angle = opts.angle ?? 0;
  const color = opts.color ?? BLACK;
  doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
  doc.setFontSize(opts.fontSize);
  const halo = 0.18;
  doc.setTextColor(255, 255, 255);
  for (const [dx, dy] of [
    [-halo, 0],
    [halo, 0],
    [0, -halo],
    [0, halo],
    [-halo, -halo],
    [halo, -halo],
    [-halo, halo],
    [halo, halo],
  ]) {
    doc.text(text, x + dx, y + dy, { align, angle });
  }
  doc.setTextColor(...color);
  doc.text(text, x, y, { align, angle });
}

function drawLabelPlate(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  opts: { fontSize: number; maxWidth?: number },
) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(opts.fontSize);
  const tw = doc.getTextWidth(text);
  const pw = Math.min(opts.maxWidth ?? tw + 4, tw + 4);
  const ph = opts.fontSize * 0.45 + 2;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.15);
  doc.roundedRect(x - pw / 2, y - ph / 2 - 0.5, pw, ph, 0.8, 0.8, 'FD');
  doc.setTextColor(30, 30, 30);
  doc.text(text, x, y, { align: 'center', maxWidth: pw - 1 });
}

function drawPolyline(
  doc: jsPDF,
  points: [number, number][],
  color: [number, number, number],
  lw = 0.5,
  dash?: number[],
) {
  if (points.length < 2) return;
  doc.setDrawColor(...color);
  doc.setLineWidth(lw);
  if (dash) doc.setLineDashPattern(dash, 0);
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    doc.line(x1, y1, x2, y2);
  }
  if (dash) doc.setLineDashPattern([], 0);
}

function drawCompassNorth(doc: jsPDF, cx: number, cy: number, r: number) {
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.2);
  doc.setFillColor(255, 255, 255);
  doc.circle(cx, cy, r, 'S');
  doc.setFillColor(...BLACK);
  doc.triangle(cx, cy - r, cx - 2.5, cy - r + 5.5, cx + 2.5, cy - r + 5.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...BLACK);
  doc.text('N', cx - 2, cy - r - 2);
}

function drawGraphicScaleBar(
  doc: jsPDF,
  x: number,
  y: number,
  layout: EnterpriseOverviewLayout,
) {
  const { graphicScale } = layout;
  const barMm = graphicScale.barMm;
  const segments = Math.round(graphicScale.barMeters / graphicScale.segmentMeters);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(...BLACK);
  doc.text('Escala Gráfica:', x, y);

  const barX = x + 30;
  const barY = y - 1.5;
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.35);

  for (let i = 0; i < segments; i++) {
    const segMm = barMm / segments;
    if (i % 2 === 0) doc.setFillColor(255, 255, 255);
    else doc.setFillColor(40, 40, 40);
    doc.rect(barX + i * segMm, barY, segMm, 3, 'FD');
  }
  doc.rect(barX, barY, barMm, 3, 'S');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  for (let i = 0; i <= segments; i++) {
    const label = String(Math.round(i * graphicScale.segmentMeters));
    doc.text(label, barX + (i * barMm) / segments, barY + 5.5, {
      align: 'center',
    });
  }
  doc.text('m', barX + barMm + 3, barY + 1.5);
}

function drawHeader(
  doc: jsPDF,
  payload: EnterpriseOverviewPdfPayload,
  logoBase64: string | null,
) {
  const { company, layout, generatedAt } = payload;
  const pageW = layout.pageSizeMm.width;
  const y = 8;

  if (payload.options.showLogo && logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', 8, 5, 22, 12);
    } catch {
      /* ignore */
    }
  }

  const textX = payload.options.showLogo && logoBase64 ? 34 : 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...BLACK);
  doc.text(company.fantasyName !== 'Não informado' ? company.fantasyName : company.name, textX, y + 2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...GRAY);
  const contact: string[] = [];
  if (company.phone !== 'Não informado') contact.push(company.phone);
  if (company.email !== 'Não informado') contact.push(company.email);
  if (company.website !== 'Não informado') contact.push(company.website);
  if (company.instagram !== 'Não informado') contact.push(`@${company.instagram.replace(/^@/, '')}`);
  if (contact.length) {
    doc.text(contact.join('  •  '), textX, y + 7, { maxWidth: pageW - textX - 8 });
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...BLACK);
  doc.text('MAPA GERAL DO EMPREENDIMENTO', pageW / 2, y + 14, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(layout.statistics.projectName.toUpperCase(), pageW / 2, y + 20, {
    align: 'center',
  });

  doc.setFontSize(6);
  doc.setTextColor(...GRAY);
  doc.text(`Data de geração: ${generatedAt}`, pageW - 8, y + 4, {
    align: 'right',
  });

  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.3);
  doc.line(8, 28, pageW - 8, 28);
}

function drawSidePanel(doc: jsPDF, payload: EnterpriseOverviewPdfPayload) {
  const { layout, options } = payload;
  const panel = layout.sidePanelMm;
  const stats = layout.statistics;

  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.25);
  doc.rect(panel.x, panel.y, panel.w, panel.h);

  let y = panel.y + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...BLACK);

  if (options.showLegend) {
    doc.text('LEGENDA', panel.x + 3, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    doc.setTextColor(...GRAY);
    doc.text('Preenchimento 50%', panel.x + 3, y);
    y += 4.5;
    const legendRows: [string, [number, number, number], number][] = [
      ['Disponível', [34, 197, 94], stats.disponivel],
      ['Reservado', [234, 179, 8], stats.reservado],
      ['Vendido', [239, 68, 68], stats.vendido],
    ];
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    for (const [label, rgb, qty] of legendRows) {
      doc.setFillColor(...blendFillColorForWhiteBackground(rgb));
      doc.rect(panel.x + 3, y - 2.5, 4, 4, 'F');
      doc.setDrawColor(...ENTERPRISE_LOT_STROKE_RGB);
      doc.setLineWidth(0.35);
      doc.rect(panel.x + 3, y - 2.5, 4, 4, 'S');
      doc.setTextColor(...BLACK);
      doc.text(`${label}: ${qty}`, panel.x + 9, y);
      y += 5;
    }
    y += 2;
    doc.setFont('helvetica', 'bold');
    doc.text(`Total de lotes: ${stats.lotCount}`, panel.x + 3, y);
    y += 8;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('RESUMO', panel.x + 3, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  const summary = [
    `Empreendimento: ${stats.projectName}`,
    `Quadras: ${stats.quadraCount}`,
    `Lotes: ${stats.lotCount}`,
    `Área total: ${stats.totalAreaM2.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} m²`,
    `Emissão: ${stats.emittedAt}`,
  ];
  for (const line of summary) {
    const split = doc.splitTextToSize(line, panel.w - 6) as string[];
    for (const sl of split) {
      doc.text(sl, panel.x + 3, y);
      y += 3.8;
    }
    y += 0.5;
  }

  if (
    options.showStreetNamesAndTable &&
    layout.streetTable.mode !== 'extra_page'
  ) {
    y = drawStreetTableInPanel(doc, payload, y + 3);
  } else if (
    options.showStreetNamesAndTable &&
    layout.streetTable.mode === 'extra_page'
  ) {
    y += 4;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(5);
    doc.setTextColor(...GRAY);
    doc.text('Quadro de vias: ver página seguinte.', panel.x + 3, y);
  }

  const warnings = layout.streetWarnings;
  if (
    options.showStreetNamesAndTable &&
    (warnings.unnamedCount > 0 ||
      warnings.noGeometryCount > 0 ||
      warnings.invalidGeometryCount > 0)
  ) {
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(4.5);
    doc.setTextColor(...GRAY);
    const notes = [
      warnings.unnamedCount > 0
        ? `${warnings.unnamedCount} via(s) sem nome`
        : null,
      warnings.noGeometryCount > 0
        ? `${warnings.noGeometryCount} via(s) sem geometria`
        : null,
      warnings.invalidGeometryCount > 0
        ? `${warnings.invalidGeometryCount} geometria(s) inválida(s)`
        : null,
    ].filter(Boolean);
    for (const note of notes) {
      doc.text(String(note), panel.x + 3, y);
      y += 3.2;
    }
  }
}

function drawStreetTableInPanel(
  doc: jsPDF,
  payload: EnterpriseOverviewPdfPayload,
  startY: number,
): number {
  const { layout } = payload;
  const panel = layout.sidePanelMm;
  const table = layout.streetTable;
  let y = startY;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...BLACK);
  doc.text('QUADRO DE VIAS', panel.x + 3, y);
  y += 4;

  const fontSize = table.fontSize;
  const rowH = fontSize < 5 ? 3.4 : 3.8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize);
  doc.text('Nº', panel.x + 3, y);
  doc.text('Via', panel.x + 10, y);
  doc.text('Comp.', panel.x + panel.w - 3, y, { align: 'right' });
  y += rowH;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSize);

  const drawRow = (
    row: { number: string; name: string; lengthLabel: string },
    x: number,
    colW: number,
  ) => {
    doc.text(row.number, x, y);
    const nameMax = colW - 22;
    const nameLines = doc.splitTextToSize(row.name, nameMax) as string[];
    doc.text(nameLines[0] || row.name, x + 7, y);
    doc.text(row.lengthLabel, x + colW - 3, y, { align: 'right' });
  };

  if (table.mode === 'two_columns') {
    const mid = Math.ceil(table.rows.length / 2);
    const left = table.rows.slice(0, mid);
    const right = table.rows.slice(mid);
    const colW = (panel.w - 4) / 2;
    const y0 = y;
    for (const row of left) {
      drawRow(row, panel.x + 3, colW);
      y += rowH;
    }
    let yRight = y0;
    for (const row of right) {
      const saveY = y;
      y = yRight;
      drawRow(row, panel.x + 3 + colW, colW);
      yRight = y + rowH;
      y = saveY;
    }
    y = Math.max(y, yRight);
  } else {
    for (const row of table.rows) {
      if (y > panel.y + panel.h - 12) break;
      drawRow(row, panel.x + 3, panel.w - 4);
      y += rowH;
    }
  }

  y += 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(Math.max(4.5, fontSize));
  doc.text(`Total de vias: ${table.streetCount}`, panel.x + 3, y);
  y += rowH;
  doc.text(`Comprimento total: ${table.totalLengthLabel}`, panel.x + 3, y);
  y += rowH + 1;

  if (table.pendingRows.length > 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(4.5);
    doc.setTextColor(...GRAY);
    doc.text(
      `Pendências: ${table.pendingRows.length} via(s)`,
      panel.x + 3,
      y,
    );
    y += 3.2;
    doc.setTextColor(...BLACK);
  }

  return y;
}

function drawStreetTableExtraPage(
  doc: jsPDF,
  payload: EnterpriseOverviewPdfPayload,
) {
  const { layout, company } = payload;
  const table = layout.streetTable;
  const pageW = layout.pageSizeMm.width;
  const pageH = layout.pageSizeMm.height;

  doc.addPage();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...BLACK);
  doc.text('QUADRO DE VIAS', 14, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text(layout.statistics.projectName, 14, 24);
  doc.text(company.fantasyName || company.name, 14, 29);

  let y = 38;
  const fontSize = 8;
  const rowH = 5.2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize);
  doc.setTextColor(...BLACK);
  doc.text('Nº', 14, y);
  doc.text('Via', 28, y);
  doc.text('Comprimento', pageW - 14, y, { align: 'right' });
  y += rowH;
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.2);
  doc.line(14, y - 3, pageW - 14, y - 3);

  doc.setFont('helvetica', 'normal');
  for (const row of table.rows) {
    if (y > pageH - 24) {
      doc.addPage();
      y = 20;
    }
    doc.text(row.number, 14, y);
    doc.text(row.name, 28, y);
    doc.text(row.lengthLabel, pageW - 14, y, { align: 'right' });
    y += rowH;
  }

  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.text(`Total de vias: ${table.streetCount}`, 14, y);
  y += rowH;
  doc.text(`Comprimento total: ${table.totalLengthLabel}`, 14, y);

  if (table.pendingRows.length > 0) {
    y += rowH + 2;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.text('Pendências', 14, y);
    y += rowH;
    doc.setFont('helvetica', 'normal');
    for (const row of table.pendingRows) {
      doc.text(`${row.name} — ${row.lengthLabel}`, 14, y);
      y += rowH;
    }
  }
}

function drawStreetLabelPlacements(
  doc: jsPDF,
  payload: EnterpriseOverviewPdfPayload,
  softOccupied: OccupiedBox[],
  hardOccupied: OccupiedBox[],
): number {
  const { layout } = payload;
  const box = layout.mapBoxMm;
  let drawn = 0;

  for (const street of layout.streets) {
    if (street.unnamed || !street.labelPlacements?.length) continue;
    const grouped = {
      id: street.id,
      type: street.type,
      name: street.name,
      displayName: street.displayName,
      unnamed: street.unnamed,
      segments: (street.lines || []).map((line, lineIndex) => {
        let lengthM = 0;
        for (let i = 1; i < line.length; i++) {
          lengthM += Math.hypot(
            line[i][0] - line[i - 1][0],
            line[i][1] - line[i - 1][1],
          );
        }
        return { lineIndex, line, lengthM };
      }),
      lengthM: street.lengthM,
      lengthAvailable: street.lengthAvailable,
      issues: [] as [],
    };

    const { placements, diag } = buildStreetLabelPlacementsOnSheet({
      street: grouped,
      placements: street.labelPlacements,
      projectPoint: (p) => projectEnterprisePointToPdf(p, layout),
      hardOccupied,
      softOccupied,
      mapScaleMmPerM: layout.mapScaleMmPerM,
      mapBox: box,
    });

    if (process.env.NODE_ENV !== 'production') {
      if (/avenida\s*07|rua\s*07/i.test(street.displayName)) {
        console.info('[enterprise-overview-streets] placement diag', diag);
      }
    }

    for (const place of placements) {
      drawStreetLabelPlacement(doc, place);
      hardOccupied.push(
        rotatedTextOccupiedBox(
          place.x,
          place.y,
          place.text,
          place.fontSize,
          place.angleDeg,
        ),
      );
      drawn += 1;
    }
  }

  return drawn;
}

/** Única função que desenha texto de nome de via no mapa (estilo institucional). */
function drawStreetLabelPlacement(
  doc: jsPDF,
  place: StreetLabelSheetPlacement,
) {
  drawTextWithHalo(doc, place.text, place.x, place.y, {
    fontSize: place.fontSize,
    bold: true,
    align: 'center',
    angle: place.angleDeg,
    color: STREET_LABEL_RGB,
  });
}

function drawMapArea(doc: jsPDF, payload: EnterpriseOverviewPdfPayload) {
  const { layout, options } = payload;
  const box = layout.mapBoxMm;

  // 1. Fundo branco
  doc.setFillColor(255, 255, 255);
  doc.rect(box.x, box.y, box.w, box.h, 'F');

  // 2. Preenchimento 50% dos lotes
  drawEnterpriseLotsOnMap(doc, layout, 'fills');

  // 5. Ruas (todos os trechos)
  if (options.showStreets) {
    for (const street of layout.streets) {
      const lines =
        street.lines?.length > 0 ? street.lines : street.line ? [street.line] : [];
      for (const line of lines) {
        const pts = line.map((p) => projectEnterprisePointToPdf(p, layout));
        drawPolyline(doc, pts, [210, 210, 210], 0.55, [3, 2]);
        drawPolyline(doc, pts, [140, 140, 140], 0.22);
      }
    }
  }

  // 6. Divisas ciano dos lotes (por cima das ruas)
  drawEnterpriseLotsOnMap(doc, layout, 'strokes');

  const softOccupied: OccupiedBox[] = [];
  const hardOccupied: OccupiedBox[] = [];

  // 7. Números dos lotes (ocupação soft — não deve zerar rótulos de via)
  if (options.showLotNumbers) {
    for (const lot of layout.lots) {
      const [x, y] = projectEnterprisePointToPdf(lot.centroid, layout);
      drawTextWithHalo(doc, lot.number, x, y, {
        fontSize: 5.5,
        bold: true,
        align: 'center',
      });
      softOccupied.push({ x: x - 4, y: y - 3, w: 8, h: 5 });
    }
  }

  // 8. Nomes das quadras (ocupação hard)
  for (const q of layout.quadraLabels) {
    const [x, y] = projectEnterprisePointToPdf(q.position, layout);
    drawTextWithHalo(doc, `QD ${q.quadra}`, x, y, {
      fontSize: 7.5,
      bold: true,
      align: 'center',
    });
    hardOccupied.push({ x: x - 10, y: y - 4, w: 20, h: 7 });
  }

  // Norte / escala — reservar caixas antes dos rótulos de via
  if (options.showNorth) {
    hardOccupied.push({ x: box.x + box.w - 18, y: box.y + 2, w: 16, h: 16 });
  }
  if (options.showGraphicScale) {
    hardOccupied.push({ x: box.x + 4, y: box.y + box.h - 12, w: 90, h: 10 });
  }

  // 9. Nomes das ruas — única pipeline (buildStreetLabelPlacementsOnSheet)
  let drawnLabels = 0;
  let candidateLabels = 0;
  if (options.showStreetNamesAndTable) {
    drawnLabels = drawStreetLabelPlacements(doc, payload, softOccupied, hardOccupied);
    candidateLabels = layout.streets.reduce(
      (n, s) => n + (s.labelPlacements?.length ?? 0),
      0,
    );
    layout.streetGeometryDiag.candidates = Math.max(
      layout.streetGeometryDiag.candidates,
      candidateLabels,
    );
    layout.streetGeometryDiag.drawn = drawnLabels;
    layout.streetGeometryDiag.omittedByCollision = Math.max(
      0,
      candidateLabels - drawnLabels,
    );
    if (process.env.NODE_ENV !== 'production') {
      console.info(
        '[enterprise-overview-streets] label diag',
        layout.streetGeometryDiag,
      );
    }
  } else if (options.showStreets) {
    // Comportamento legado: placa horizontal no ponto médio (opção desligada)
    for (const street of layout.streets) {
      const pts = street.line.map((p) => projectEnterprisePointToPdf(p, layout));
      if (pts.length >= 2) {
        const mid = pts[Math.floor(pts.length / 2)];
        const label = street.displayName.replace(/^Rua\/Eixo\s*/i, '').trim();
        drawLabelPlate(doc, label, mid[0], mid[1] - 1.5, {
          fontSize: 5,
          maxWidth: 30,
        });
      }
    }
  }

  // Norte e escala
  if (options.showNorth) {
    drawCompassNorth(doc, box.x + box.w - 12, box.y + 12, 5);
  }

  if (options.showGraphicScale) {
    drawGraphicScaleBar(doc, box.x + 6, box.y + box.h - 6, layout);
  }

  // Moldura do mapa
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.4);
  doc.rect(box.x, box.y, box.w, box.h, 'S');
}

export async function generateEnterpriseOverviewPdf(
  payload: EnterpriseOverviewPdfPayload,
): Promise<jsPDF> {
  const { layout } = payload;
  const orientation =
    layout.pageSizeMm.width >= layout.pageSizeMm.height
      ? 'landscape'
      : 'portrait';
  const format =
    payload.options.format === 'a4_landscape'
      ? 'a4'
      : payload.options.format.startsWith('a3')
        ? 'a3'
        : 'a3';

  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format,
  });

  let logoBase64: string | null = payload.logoBase64 ?? null;
  if (payload.options.showLogo && !logoBase64 && payload.company.logoUrl) {
    try {
      logoBase64 = await loadImageAsBase64(payload.company.logoUrl);
    } catch {
      logoBase64 = await loadReportHeaderLogoBase64(null);
    }
  }

  drawHeader(doc, payload, logoBase64);
  if (payload.options.showLegend) {
    drawSidePanel(doc, payload);
  } else if (payload.options.showStreetNamesAndTable) {
    // Painel mínimo só com quadro de vias
    drawSidePanel(doc, payload);
  }
  lastEnterpriseLotDrawStats = null;
  drawMapArea(doc, payload);

  if (
    payload.options.showStreetNamesAndTable &&
    layout.streetTable.mode === 'extra_page'
  ) {
    drawStreetTableExtraPage(doc, payload);
  }

  if (
    payload.options.showStreetNamesAndTable &&
    (layout.streetWarnings.unnamedCount > 0 ||
      layout.streetWarnings.noGeometryCount > 0 ||
      layout.streetWarnings.invalidGeometryCount > 0 ||
      layout.streetGeometryDiag.normalized > 0)
  ) {
    console.info('[enterprise-overview] street warnings', layout.streetWarnings);
    console.info(
      '[enterprise-overview] street geometry diag',
      layout.streetGeometryDiag,
    );
  }

  return doc;
}

/** Extrai texto do PDF para validação em testes Node. */
export function enterpriseOverviewPdfTextContent(doc: jsPDF): string {
  const parts: string[] = [];
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    const text = (
      doc as unknown as {
        getPage: (n: number) => {
          getTextContent?: () => { items: { str: string }[] };
        };
      }
    ).getPage?.(p)?.getTextContent?.();
    if (text?.items) {
      parts.push(text.items.map((i) => i.str).join(' '));
    }
  }
  if (parts.length) return parts.join('\n');
  return Buffer.from(doc.output('arraybuffer')).toString('latin1');
}

export function enterpriseOverviewPdfToBlob(doc: jsPDF): Blob {
  return doc.output('blob');
}

export function downloadEnterpriseOverviewPdf(doc: jsPDF, filename: string) {
  doc.save(filename);
}

export async function generateEnterpriseOverviewFromInput(
  input: FitEnterpriseInput & {
    company: Record<string, unknown> | null | undefined;
  },
): Promise<jsPDF> {
  const payload = buildEnterpriseOverviewPayload(input);
  return generateEnterpriseOverviewPdf(payload);
}
