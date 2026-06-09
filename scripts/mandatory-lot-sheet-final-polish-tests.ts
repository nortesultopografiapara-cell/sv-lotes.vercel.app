/**
 * ETAPA 4.2 — correção cirúrgica final da prancha SIGEF (layout PDF).
 * npx tsx scripts/mandatory-lot-sheet-final-polish-tests.ts
 */

import { buildLotConfrontationAudit, confrontantsFromAudit } from '../lib/assistedConfrontation';
import { buildOfficialSheetLocalGeometry } from '../lib/lotSheetCoordinates';
import {
  buildSketchLayoutFromBlock,
  computeLotFrontLayoutContext,
  LOT_FRONT_BADGE_DEPTH_FRACTION,
  LOT_NUMBER_AREA_MIN_GAP_MM,
  MEASURE_LABEL_EXTERNAL_OFFSET_MM,
  MEASURE_LABEL_INTERNAL_OFFSET_MM,
  MEASURE_LABEL_MIN_EDGE_CLEARANCE_MM,
  placeLotNumberAndArea,
  pointInsideRing,
  resolveMeasureLabelPosition,
  resolveVertexLabelSpacing,
  VERTEX_LABEL_MIN_SPACING_MM,
  type MeasureLabelEdgeInput,
} from '../lib/lotSheetLayout';
import { generateLotSheetPdf } from '../lib/lotSheetPdf';
import type { LotSheetPayload } from '../lib/lotSheetData';
import {
  computeConfrontationsPanelHeight,
  computeSigefPageRegions,
  polygonSheetBBox,
  resolveSigefGraphicScaleBox,
  SIGEF_SCALE_BAR_H_MM,
  SIGEF_SCALE_BAR_MIN_W_MM,
  SIGEF_SCALE_BOTTOM_INSET_MM,
  SIGEF_SCALE_BOX_H_MM,
  SIGEF_SCALE_BOX_W_MM,
  SIGEF_SCALE_LEFT_INSET_MM,
  sigefBoxesOverlap,
  sigefLotBBoxOverlapsScaleBox,
  sigefMetricTableCells,
  sigefMetricTableHeaders,
  sigefMetricTableTextValid,
  type SigefBox,
} from '../lib/lotSheetSigefLayout';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
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

function rectVerts(): [number, number][] {
  return [
    [30, 30],
    [90, 30],
    [90, 80],
    [30, 80],
  ];
}

function projectRingToSheet(
  localRing: [number, number][],
  bbox: { minX: number; maxX: number; minY: number; maxY: number },
  box: SigefBox,
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

function sheetVertsFromBlock(
  lotBlock: Record<string, unknown>,
): [number, number][] {
  const geom = buildOfficialSheetLocalGeometry(lotBlock);
  assert(geom != null, 'geometria');
  const regions = computeSigefPageRegions(210, 297, 8);
  return projectRingToSheet(geom.localRing, geom.bboxMeters, regions.sketch);
}

function testMeasureLabelOffsetConstants() {
  assert(MEASURE_LABEL_INTERNAL_OFFSET_MM === 6, 'offset interno 6mm');
  assert(MEASURE_LABEL_EXTERNAL_OFFSET_MM === 5, 'offset externo 5mm');
  assert(MEASURE_LABEL_MIN_EDGE_CLEARANCE_MM === 6, 'clearance mínimo 6mm');
  console.log('OK testMeasureLabelOffsetConstants');
}

function testResolveMeasureLabelPositionClearance() {
  const verts = rectVerts();
  const edge: MeasureLabelEdgeInput = {
    mid: [60, 30],
    p1: verts[0],
    p2: verts[1],
    inNx: 0,
    inNy: 1,
    exNx: 0,
    exNy: -1,
  };
  const pos = resolveMeasureLabelPosition(edge, verts, []);
  assert(pos.offsetUsed >= 6, `offset >= 6: ${pos.offsetUsed}`);
  assert(pos.y >= 36, `medida afastada da divisa: y=${pos.y}`);
  console.log('OK testResolveMeasureLabelPositionClearance');
}

function testResolveMeasureLabelForceInternalOnly() {
  const verts = rectVerts();
  const edge: MeasureLabelEdgeInput = {
    mid: [54, 50],
    p1: verts[0],
    p2: verts[1],
    inNx: 0,
    inNy: 1,
    exNx: 0,
    exNy: -1,
  };
  const pos = resolveMeasureLabelPosition(edge, verts, [], {
    edgeLenMm: 8,
    forceInternalOnly: true,
  });
  assert(pos.side === 'in', `SIGEF força interno: ${pos.side}`);
  assert(pos.offsetUsed >= 6, `offset interno >= 6: ${pos.offsetUsed}`);
  console.log('OK testResolveMeasureLabelForceInternalOnly');
}

function testResolveMeasureLabelShortEdgeExternalFirst() {
  const verts: [number, number][] = [
    [50, 50],
    [58, 50],
    [58, 70],
    [50, 70],
  ];
  const edge: MeasureLabelEdgeInput = {
    mid: [54, 50],
    p1: verts[0],
    p2: verts[1],
    inNx: 0,
    inNy: 1,
    exNx: 0,
    exNy: -1,
  };
  const pos = resolveMeasureLabelPosition(edge, verts, [], { edgeLenMm: 8 });
  assert(pos.offsetUsed >= 5, `segmento curto offset >= 5: ${pos.offsetUsed}`);
  console.log('OK testResolveMeasureLabelShortEdgeExternalFirst');
}

function testPlaceLotNumberAndAreaGap() {
  const verts = rectVerts();
  const layout = placeLotNumberAndArea(verts, '2.727,00 m²', [], {
    crossWidthMm: 50,
    inwardDepthMm: 40,
    narrow: false,
    vertexCount: 4,
    frontEdgeIndex: 0,
  });
  assert(
    layout.numberAreaGapMm >= LOT_NUMBER_AREA_MIN_GAP_MM - 0.5,
    `gap número×área >= 10mm: ${layout.numberAreaGapMm}`,
  );
  assert(
    layout.areaPos[1] > layout.badgePos[1] + layout.badgeRadius,
    'área abaixo do número',
  );
  assert(Math.abs(layout.areaPos[0] - layout.badgePos[0]) < 8, 'área alinhada ao número');
  assert(!layout.useCombinedBox, 'sem caixa branca combinada');
  assert(layout.areaInsidePolygon, 'área dentro do polígono');
  console.log('OK testPlaceLotNumberAndAreaGap');
}

function testPlaceLotNumberFromOfficialFront() {
  const verts = rectVerts();
  const front = computeLotFrontLayoutContext(verts, 0);
  const layout = placeLotNumberAndArea(verts, '2.500,00 m²', [], {
    crossWidthMm: 50,
    inwardDepthMm: 40,
    narrow: false,
    vertexCount: 4,
    frontEdgeIndex: 0,
  });
  const expectedDepth = front.maxInwardDepthMm * LOT_FRONT_BADGE_DEPTH_FRACTION;
  const badgeDepth =
    (layout.badgePos[0] - front.frontMid[0]) * front.inwardNx +
    (layout.badgePos[1] - front.frontMid[1]) * front.inwardNy;
  assert(badgeDepth >= expectedDepth * 0.5, `número avança da frente: ${badgeDepth}`);
  assert(
    layout.badgePos[1] > front.frontMid[1] + 2,
    'número não fica no centroide do retângulo',
  );
  console.log('OK testPlaceLotNumberFromOfficialFront');
}

function testAreaDoesNotCollideWithMeasures() {
  const verts = rectVerts();
  const zones: { pos: [number, number]; radius: number; kind: string }[] = [];
  for (let i = 0; i < verts.length; i++) {
    const p1 = verts[i];
    const p2 = verts[(i + 1) % verts.length];
    const mid: [number, number] = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const len = Math.hypot(dx, dy) || 1;
    const exNx = dy / len;
    const exNy = -dx / len;
    const pos = resolveMeasureLabelPosition(
      {
        mid,
        p1,
        p2,
        inNx: -exNx,
        inNy: -exNy,
        exNx,
        exNy,
      },
      verts,
      zones,
      { edgeLenMm: len },
    );
    zones.push({ pos: [pos.x, pos.y], radius: 5, kind: 'distance' });
  }
  const layout = placeLotNumberAndArea(verts, '2.727,00 m²', zones, {
    crossWidthMm: 50,
    inwardDepthMm: 40,
    narrow: false,
    vertexCount: 4,
    frontEdgeIndex: 0,
  });
  assert(layout.areaInsidePolygon, 'área dentro do polígono');
  for (const z of zones) {
    const d = Math.hypot(
      layout.areaPos[0] - z.pos[0],
      layout.areaPos[1] - z.pos[1],
    );
    assert(d >= z.radius + 6, `área não colide com medida: d=${d}`);
  }
  console.log('OK testAreaDoesNotCollideWithMeasures');
}

function testVertexLabelSpacing() {
  const verts: [number, number][] = [
    [40, 40],
    [42, 40],
    [42, 60],
    [40, 60],
  ];
  const s1 = resolveVertexLabelSpacing(1, verts, VERTEX_LABEL_MIN_SPACING_MM);
  assert(s1 >= 1, `stagger vértice próximo: ${s1}`);
  console.log('OK testVertexLabelSpacing');
}

function testConfrontationsPanelDynamicHeight() {
  const h = computeConfrontationsPanelHeight({
    frente: 'RUA INTERNA',
    fundo: 'LOTE 05',
    ladoDireito: 'LOTE 03',
    ladoEsquerdo: 'ÁREA DE PRESERVAÇÃO PERMANENTE — APP MARGEM DO RIO',
  });
  assert(h >= 28, `altura dinâmica confrontações: ${h}`);
  console.log('OK testConfrontationsPanelDynamicHeight');
}

function testSigefRegionsConfrontationsTableGap() {
  const regions = computeSigefPageRegions(210, 297, 8);
  const gap =
    regions.coordinates.y - (regions.confrontations.y + regions.confrontations.h);
  assert(gap >= 4, `gap confrontações×tabela >= 4mm: ${gap}`);
  assert(
    !sigefBoxesOverlap(regions.confrontations, regions.coordinates, 4),
    'sem sobreposição confrontações/tabela',
  );
  assert(regions.confrontations.h >= 22, 'altura fixa confrontações');
  console.log('OK testSigefRegionsConfrontationsTableGap');
}

function testSigefScaleBarConstants() {
  assert(SIGEF_SCALE_BAR_MIN_W_MM === 70, 'escala min 70mm');
  assert(SIGEF_SCALE_BAR_H_MM === 6, 'escala altura 6mm');
  assert(SIGEF_SCALE_LEFT_INSET_MM === 8, 'inset esquerdo 8mm');
  assert(SIGEF_SCALE_BOTTOM_INSET_MM === 18, 'inset inferior 18mm');
  assert(SIGEF_SCALE_BOX_W_MM >= 70 && SIGEF_SCALE_BOX_W_MM <= 80, 'largura caixa 70-80mm');
  assert(SIGEF_SCALE_BOX_H_MM === 8, 'altura caixa 8mm');
  console.log('OK testSigefScaleBarConstants');
}

function testSigefMetricTableDeParaColumns() {
  const headers = sigefMetricTableHeaders();
  assert(headers[0] === 'De', 'coluna De');
  assert(headers[1] === 'Para', 'coluna Para');
  const cells = sigefMetricTableCells({
    from: 'M-01',
    to: 'M-02',
    azimute: '90°00\'00"',
    distancia: '10,00 m',
    coordE: '500000,00',
    coordN: '7500000,00',
  });
  assert(cells[0] === 'M-01' && cells[1] === 'M-02', 'células separadas');
  assert(sigefMetricTableTextValid(cells), 'sem caractere inválido');
  assert(!sigefMetricTableTextValid(['M-01 !\' M-02']), 'rejeita !\'');
  assert(!sigefMetricTableTextValid(['M-01 → M-02']), 'rejeita seta');
  console.log('OK testSigefMetricTableDeParaColumns');
}

function testSigefScaleDoesNotCollideWithLot(lotNum: string, lotBlock: Record<string, unknown>) {
  const regions = computeSigefPageRegions(210, 297, 8);
  const verts = sheetVertsFromBlock(lotBlock);
  const lotBBox = polygonSheetBBox(verts);
  const plan = resolveSigefGraphicScaleBox(
    regions.sketch,
    regions.confrontations,
    lotBBox,
  );
  if (plan.placement === 'sketch-bottom-left') {
    assert(
      !sigefLotBBoxOverlapsScaleBox(lotBBox, plan.box),
      `escala colide com lote ${lotNum}`,
    );
  }
  console.log(`OK testSigefScaleDoesNotCollideWithLot ${lotNum}`);
}

function testConfrontationsFromAuditLot04() {
  const b = block(
    [
      lineSeg(0, 7500000, 500000, 7500000, 500087.27, 87.27),
      lineSeg(1, 7500000, 500087.27, 7500028.31, 500087.27, 28.31),
      lineSeg(2, 7500028.31, 500087.27, 7500028.49, 500000, 89.54),
      lineSeg(3, 7500028.49, 500000, 7500000, 500000, 28.49),
    ],
    {
      number: '04',
      block_name: '01',
      front_segment_index: 0,
      front_street_name: 'RUA INTERNA',
    },
  );
  const audit = buildLotConfrontationAudit(b, 'lot-04', [b], [], null);
  const c = confrontantsFromAudit(audit);
  assert(c.frente.length > 0, 'frente lote 04');
  testSigefScaleDoesNotCollideWithLot('04', b);
  const verts = sheetVertsFromBlock(b);
  const layout = placeLotNumberAndArea(verts, '2.500,00 m²', [], {
    crossWidthMm: 40,
    inwardDepthMm: 30,
    narrow: false,
    vertexCount: 4,
    frontEdgeIndex: 0,
  });
  assert(layout.areaInsidePolygon, 'lote 04 área dentro');
  assert(pointInsideRing(layout.badgePos[0], layout.badgePos[1], verts), 'número dentro');
  console.log('OK testConfrontationsFromAuditLot04');
}

async function buildPdfPayload(
  lotBlock: Record<string, unknown>,
  confrontants: ReturnType<typeof confrontantsFromAudit>,
): Promise<LotSheetPayload> {
  const geom = buildOfficialSheetLocalGeometry(lotBlock);
  assert(geom != null, 'geometria');
  const layout = buildSketchLayoutFromBlock(lotBlock, String(lotBlock.id));
  const metricCount = Math.max(4, geom.segments?.length ?? 4);
  const rows = Array.from({ length: metricCount }, (_, i) => ({
    from: `M-${String(i + 1).padStart(2, '0')}`,
    to: `M-${String(i + 2).padStart(2, '0')}`,
    azimute: '90°00\'00"',
    distancia: '10,00 m',
    coordE: '500000,00',
    coordN: '7500000,00',
  }));
  return {
    project: { name: 'PROJETO SIGEF TESTE', escala_padrao: '1:500' },
    lot: lotBlock,
    owner: 'Cliente Teste',
    ownerDocument: '000.000.000-00',
    ownerDetails: {
      name: 'Cliente Teste',
      cpf: '000.000.000-00',
      fatherName: '—',
      motherName: '—',
      address: '—',
      neighborhood: '—',
      municipality: 'Belém',
      cadastralInscription: '—',
    },
    company: null,
    technicalResponsible: {
      name: 'SEVERINO JOSÉ DE FRANÇA',
      title: 'TÉC. EM AGRIMENSURA',
      registry_type: 'CFT',
      registry_number: '65082028200',
    },
    neighbors: [],
    cardinalConfrontants: [],
    blockSketch: null,
    projectMap: [],
    vertices: [],
    segments: [],
    metricRows: rows,
    coordinatesAvailable: true,
    frontEdgeIndex: Number(lotBlock.front_segment_index) || 0,
    quadraStreetNames: [],
    validation: {
      code: 'X',
      url: 'https://x',
      emittedAt: new Date().toISOString(),
    },
    version: 'test',
    geometry: {
      utmRing: geom.utmRing,
      localRing: geom.localRing,
      bboxMeters: geom.bboxMeters,
    },
    measures: {
      frente: '—',
      fundo: '—',
      ladoDireito: '—',
      ladoEsquerdo: '—',
      chanfre: '—',
      curva: '—',
      raio: '—',
      corda: '—',
      area: `${Number(lotBlock.area).toLocaleString('pt-BR')} m²`,
    },
    scaleLabel: '1 : 500',
    sideConfrontants: confrontants,
    lotAddressLine: '—',
    memorialFrontClause: '—',
    memorialTechnicalHtml: '',
    memorialDraftPlain: '',
    officialEdgeLengths: layout.edgeLabels,
    sketchSides: layout.sketchSides,
    ignoredSegmentNote: null,
  } as LotSheetPayload;
}

async function testPdfLot04() {
  const b = block(
    [
      lineSeg(0, 7500000, 500000, 7500000, 500087.27, 87.27),
      lineSeg(1, 7500000, 500087.27, 7500028.31, 500087.27, 28.31),
      lineSeg(2, 7500028.31, 500087.27, 7500028.49, 500000, 89.54),
      lineSeg(3, 7500028.49, 500000, 7500000, 500000, 28.49),
    ],
    { id: 'lot-04', number: '04', block_name: '01', front_segment_index: 0, area: 2500 },
  );
  const c = confrontantsFromAudit(buildLotConfrontationAudit(b, 'lot-04', [b], [], null));
  const doc = await generateLotSheetPdf(await buildPdfPayload(b, c));
  assert(doc.getNumberOfPages() >= 1, 'pdf lote 04');
  console.log('OK testPdfLot04');
}

async function testPdfLot010() {
  const b = block(
    [
      lineSeg(0, 7500000, 500000, 7500000, 500030.62, 30.62, 'front'),
      lineSeg(1, 7500000, 500030.62, 7500087.25, 500030.62, 87.25, 'left'),
      lineSeg(2, 7500087.25, 500030.62, 7500087.25, 500062.47, 31.85, 'back'),
      lineSeg(3, 7500087.25, 500062.47, 7500026.73, 500062.47, 60.74, 'right'),
      lineSeg(4, 7500026.73, 500062.47, 7500026.73, 500126.21, 63.74, 'right'),
      lineSeg(5, 7500026.73, 500126.21, 7500000, 500126.21, 26.73, 'back'),
      lineSeg(6, 7500000, 500126.21, 7500000, 500000, 126.21, 'left'),
    ],
    { id: 'lot-010', number: '010', block_name: '02', front_segment_index: 0, area: 2727 },
  );
  const c = confrontantsFromAudit(buildLotConfrontationAudit(b, 'lot-010', [b], [], null));
  testSigefScaleDoesNotCollideWithLot('010', b);
  const doc = await generateLotSheetPdf(await buildPdfPayload(b, c));
  assert(doc.getNumberOfPages() >= 1, 'pdf lote 010');
  console.log('OK testPdfLot010');
}

async function testPdfLot018() {
  const b = block(
    [
      lineSeg(0, 7500000, 500000, 7500000, 500050, 50),
      lineSeg(1, 7500000, 500050, 7500100, 500050, 100),
      lineSeg(2, 7500100, 500050, 7500100, 500000, 50),
      lineSeg(3, 7500100, 500000, 7500000, 500000, 100),
      lineSeg(4, 7500000, 500000, 7500000, 500030, 30),
      lineSeg(5, 7500000, 500030, 7500030, 500030, 30),
      lineSeg(6, 7500030, 500030, 7500030, 500000, 30),
    ],
    { id: 'lot-018', number: '018', block_name: '03', front_segment_index: 0, area: 5000 },
  );
  const c = confrontantsFromAudit(buildLotConfrontationAudit(b, 'lot-018', [b], [], null));
  testSigefScaleDoesNotCollideWithLot('018', b);
  const doc = await generateLotSheetPdf(await buildPdfPayload(b, c));
  assert(doc.getNumberOfPages() >= 1, 'pdf lote 018');
  console.log('OK testPdfLot018');
}

async function main() {
  testMeasureLabelOffsetConstants();
  testResolveMeasureLabelPositionClearance();
  testResolveMeasureLabelForceInternalOnly();
  testResolveMeasureLabelShortEdgeExternalFirst();
  testPlaceLotNumberAndAreaGap();
  testPlaceLotNumberFromOfficialFront();
  testConfrontationsPanelDynamicHeight();
  testAreaDoesNotCollideWithMeasures();
  testVertexLabelSpacing();
  testSigefRegionsConfrontationsTableGap();
  testSigefScaleBarConstants();
  testSigefMetricTableDeParaColumns();
  testConfrontationsFromAuditLot04();
  await testPdfLot04();
  await testPdfLot010();
  await testPdfLot018();
  console.log('mandatory-lot-sheet-final-polish-tests: all passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
