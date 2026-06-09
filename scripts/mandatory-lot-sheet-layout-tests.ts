/**
 * ETAPA 3 — layout profissional da prancha PDF.
 * npx tsx scripts/mandatory-lot-sheet-layout-tests.ts
 */

import { applyConfrontantToSegmentRows } from '../lib/segmentConfrontantPersist';
import {
  buildGroupedOfficialEdgeLabels,
  buildSketchLayoutFromBlock,
  clampPointToBox,
  graphicScaleBandRect,
  planFrontStreetLabel,
  wrapConfrontantText,
} from '../lib/lotSheetLayout';
import { generateLotSheetPdf } from '../lib/lotSheetPdf';
import { buildOfficialSheetLocalGeometry } from '../lib/lotSheetCoordinates';
import type { LotSheetPayload } from '../lib/lotSheetData';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function near(a: number | null | undefined, b: number, tol = 0.06): boolean {
  return a != null && Number.isFinite(a) && Math.abs(a - b) <= tol;
}

function lineSeg(
  idx: number,
  north: number,
  east: number,
  endNorth: number,
  endEast: number,
  distance: number,
  official_side?: string,
) {
  const row: Record<string, unknown> = {
    segment_index: idx,
    north,
    east,
    end_north: endNorth,
    end_east: endEast,
    distance,
    segment_type: 'LINE',
  };
  if (official_side) row.official_side = official_side;
  return row;
}

function block(
  segments: Record<string, unknown>[],
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'test-block',
    number: 'T',
    area: 1000,
    segments_json: segments,
    ...extra,
  };
}

/** Lote retangular simples — um total por lado. */
function testGroupedEdgeLabelsRectangle() {
  const segs = [
    lineSeg(0, 0, 0, 0, 50, 50),
    lineSeg(1, 0, 50, 100, 50, 100),
    lineSeg(2, 100, 50, 100, 0, 50),
    lineSeg(3, 100, 0, 0, 0, 100),
  ];
  const b = block(segs, { front_segment_index: 0, frente: 50 });
  const labels = buildGroupedOfficialEdgeLabels(b, 4);
  const nonEmpty = labels.filter((l) => l && l !== '—');
  assert(nonEmpty.length === 4, `4 medidas: ${nonEmpty.length}`);
  assert(labels.some((l) => l.includes('50,00')), `frente/fundo: ${labels}`);
  assert(labels.some((l) => l.includes('100,00')), `laterais: ${labels}`);
  const dup = labels.filter((l) => l.includes('50,00')).length;
  assert(dup === 2, `dois lados de 50m: ${dup}`);
  console.log('OK testGroupedEdgeLabelsRectangle');
}

/** Lote 010 — lado direito 96,54 m em um único rótulo. */
function testGroupedEdgeLabelsLot010() {
  const segs = [
    lineSeg(0, 7500000, 500000, 7500000, 500030.62, 30.62, 'front'),
    lineSeg(1, 7500000, 500030.62, 7500087.25, 500030.62, 87.25, 'left'),
    lineSeg(2, 7500087.25, 500030.62, 7500087.25, 500062.47, 31.85, 'back'),
    lineSeg(3, 7500087.25, 500062.47, 7500026.73, 500062.47, 60.74, 'right'),
    lineSeg(4, 7500026.73, 500062.47, 7500020.6, 500056.34, 7.26, 'right'),
    lineSeg(5, 7500020.6, 500056.34, 7500000, 500030.62, 28.54, 'right'),
  ];
  const b = block(segs, {
    number: '010',
    front_segment_index: 0,
    front_street_name: 'RUA CENTRAL',
    area: 2727.13,
  });
  const labels = buildGroupedOfficialEdgeLabels(b, 6);
  const rightLabels = labels.filter((l) => l.includes('96,54'));
  assert(rightLabels.length === 1, `dir único 96,54: ${labels}`);
  const emptyRightSegs = [3, 4, 5].filter((i) => !labels[i] || labels[i] === '');
  assert(emptyRightSegs.length >= 2, 'segmentos dir secundários vazios');
  const layout = buildSketchLayoutFromBlock(b, 'test-block');
  const dirSide = layout.sketchSides.find((s) => s.role === 'ladoDireito');
  assert(dirSide != null, 'lado direito no sketch');
  assert(
    dirSide!.measureLabel.includes('96,54'),
    `sketch dir ${dirSide!.measureLabel}`,
  );
  console.log('OK testGroupedEdgeLabelsLot010');
}

/** official_side manual preserva totais agrupados. */
function testOfficialSideManualGroupedTotals() {
  const segs = [
    lineSeg(0, 7500000, 500000, 7500000, 500030.62, 30.62, 'front'),
    lineSeg(1, 7500000, 500030.62, 7500060.74, 500030.62, 60.74),
    lineSeg(2, 7500060.74, 500030.62, 7500065.87, 500035.75, 7.26, 'right'),
    lineSeg(3, 7500065.87, 500035.75, 7500087.25, 500057.13, 28.54),
    lineSeg(4, 7500087.25, 500057.13, 7500087.25, 500037.65, 19.48),
    lineSeg(5, 7500087.25, 500037.65, 7500087.25, 500030.62, 12.37),
    lineSeg(6, 7500087.25, 500030.62, 7500000, 500030.62, 87.25),
  ];
  const b = block(segs, {
    number: '010',
    front_segment_index: 0,
    front_street_name: 'RUA CENTRAL',
    area: 2727.13,
  });
  const labels = buildGroupedOfficialEdgeLabels(b, 7);
  assert(
    labels.filter((l) => l.includes('96,54')).length === 1,
    `dir 96,54 com official_side: ${labels}`,
  );
  console.log('OK testOfficialSideManualGroupedTotals');
}

/** Confrontação manual refletida no sketch. */
function testManualConfrontantOnSketchSide() {
  const segs = [
    lineSeg(0, 0, 0, 0, 50, 50),
    lineSeg(1, 0, 50, 100, 50, 100),
    lineSeg(2, 100, 50, 100, 0, 50),
    lineSeg(3, 100, 0, 0, 0, 100),
  ];
  let b = block(segs, { front_segment_index: 0, frente: 50 });
  const rows = applyConfrontantToSegmentRows(
    b,
    [2],
    'Lote Vizinho 99',
    'lot',
    'manual',
  );
  b = { ...b, segments_json: rows };
  const layout = buildSketchLayoutFromBlock(b, 'test-block');
  const fundo = layout.sketchSides.find((s) => s.role === 'fundo');
  assert(
    fundo?.confrontantLabel.includes('Vizinho') ||
      layout.confrontants.fundo.includes('Vizinho'),
    `manual fundo: ${fundo?.confrontantLabel}`,
  );
  console.log('OK testManualConfrontantOnSketchSide');
}

/** Nome de rua permanece dentro da prancha. */
function testStreetLabelInsideSketchBox() {
  const sketchBox = { x: 10, y: 15, w: 180, h: 120 };
  const plan = planFrontStreetLabel(
    [100, 40],
    0,
    -1,
    0,
    80,
    sketchBox,
    null,
    false,
  );
  assert(plan.x >= sketchBox.x + 2, `x dentro: ${plan.x}`);
  assert(plan.x <= sketchBox.x + sketchBox.w - 2, `x max: ${plan.x}`);
  assert(plan.y >= sketchBox.y + 2, `y dentro: ${plan.y}`);
  assert(plan.y <= sketchBox.y + sketchBox.h - 2, `y max: ${plan.y}`);
  const [cx, cy] = clampPointToBox(500, 500, sketchBox);
  assert(cx < sketchBox.x + sketchBox.w, 'clamp x');
  assert(cy < sketchBox.y + sketchBox.h, 'clamp y');
  console.log('OK testStreetLabelInsideSketchBox');
}

/** Logradouro deslocado acima da escala gráfica. */
function testStreetLabelAvoidsScaleBand() {
  const sketchBox = { x: 8, y: 12, w: 190, h: 100 };
  const scaleRect = graphicScaleBandRect(8, 95, 190);
  const plan = planFrontStreetLabel(
    [100, 88],
    0,
    1,
    0,
    70,
    sketchBox,
    scaleRect,
    false,
  );
  assert(
    plan.y < scaleRect.y - 1 || plan.fontSize <= 11,
    `evita escala y=${plan.y} scaleY=${scaleRect.y}`,
  );
  console.log('OK testStreetLabelAvoidsScaleBand');
}

/** Confrontante longo quebra em linhas. */
function testWrapLongConfrontant() {
  const long =
    'LOTEAMENTO RESIDENCIAL PARQUE DAS ACÁCIAS / RUA PROFESSOR JOSÉ MARIA DA SILVA SANTOS';
  const lines = wrapConfrontantText(long, 38, 3);
  assert(lines.length >= 2, `quebra: ${lines.length}`);
  assert(lines.join(' ').includes('ACÁCIAS'), 'conteúdo preservado');
  console.log('OK testWrapLongConfrontant');
}

/** Geração PDF não lança com payload sintético retangular. */
async function testGenerateLotSheetPdfSynthetic() {
  const segs = [
    lineSeg(0, 7500000, 500000, 7500000, 500050, 50),
    lineSeg(1, 7500000, 500050, 7500100, 500050, 100),
    lineSeg(2, 7500100, 500050, 7500100, 500000, 50),
    lineSeg(3, 7500100, 500000, 7500000, 500000, 100),
  ];
  const b = block(segs, {
    number: '12',
    block_name: '02',
    front_segment_index: 0,
    front_street_name: 'RUA CENTRAL',
    area: 5000,
  });
  const geom = buildOfficialSheetLocalGeometry(b);
  assert(geom != null, 'geometria local');
  const layout = buildSketchLayoutFromBlock(b, 'test-block');

  const payload = {
    project: { name: 'Teste', escala_padrao: '1:600' },
    lot: b,
    owner: 'Não informado',
    ownerDocument: '—',
    ownerDetails: {
      name: 'Não informado',
      cpf: '—',
      fatherName: '—',
      motherName: '—',
      address: '—',
      neighborhood: '—',
      municipality: '—',
      cadastralInscription: '—',
    },
    company: null,
    technicalResponsible: null,
    neighbors: [],
    cardinalConfrontants: [],
    blockSketch: null,
    projectMap: [],
    vertices: [],
    segments: [],
    metricRows: [],
    coordinatesAvailable: true,
    frontEdgeIndex: 0,
    quadraStreetNames: ['RUA CENTRAL'],
    validation: { code: 'X', url: 'https://x', emittedAt: new Date().toISOString() },
    version: 'test',
    geometry: {
      utmRing: geom!.utmRing,
      localRing: geom!.localRing,
      bboxMeters: geom!.bboxMeters,
    },
    measures: {
      frente: '50,00 m',
      fundo: '50,00 m',
      ladoDireito: '100,00 m',
      ladoEsquerdo: '100,00 m',
      chanfre: '—',
      curva: '—',
      raio: '—',
      corda: '—',
      area: '5.000,00 m²',
    },
    scaleLabel: '1 : 600',
    sideConfrontants: layout.confrontants,
    lotAddressLine: '—',
    memorialFrontClause: '—',
    memorialTechnicalHtml: '',
    memorialDraftPlain: '',
    officialEdgeLengths: layout.edgeLabels,
    sketchSides: layout.sketchSides,
    ignoredSegmentNote: null,
  } as LotSheetPayload;

  const doc = await generateLotSheetPdf(payload);
  assert(doc.getNumberOfPages() >= 1, 'pdf gerado');
  console.log('OK testGenerateLotSheetPdfSynthetic');
}

async function main() {
  testGroupedEdgeLabelsRectangle();
  testGroupedEdgeLabelsLot010();
  testOfficialSideManualGroupedTotals();
  testManualConfrontantOnSketchSide();
  testStreetLabelInsideSketchBox();
  testStreetLabelAvoidsScaleBand();
  testWrapLongConfrontant();
  await testGenerateLotSheetPdfSynthetic();
  console.log('mandatory-lot-sheet-layout-tests: all passed');
}

void main();
