/**
 * ETAPA 4.1 — acabamento profissional final da prancha SIGEF.
 * npx tsx scripts/mandatory-lot-sheet-final-polish-tests.ts
 */

import { buildLotConfrontationAudit, confrontantsFromAudit } from '../lib/assistedConfrontation';
import { buildOfficialSheetLocalGeometry } from '../lib/lotSheetCoordinates';
import {
  buildSketchLayoutFromBlock,
  LOT_NUMBER_AREA_MIN_GAP_MM,
  MEASURE_LABEL_EXTERNAL_OFFSET_MM,
  MEASURE_LABEL_INTERNAL_OFFSET_MM,
  placeLotNumberAndArea,
  resolveMeasureLabelPosition,
  resolveVertexLabelSpacing,
  VERTEX_LABEL_MIN_SPACING_MM,
  type MeasureLabelEdgeInput,
} from '../lib/lotSheetLayout';
import { generateLotSheetPdf } from '../lib/lotSheetPdf';
import type { LotSheetPayload } from '../lib/lotSheetData';
import {
  computeSigefPageRegions,
  SIGEF_SCALE_BAR_H_MM,
  SIGEF_SCALE_BAR_MIN_W_MM,
  sigefBoxesOverlap,
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

function testMeasureLabelOffsetConstants() {
  assert(MEASURE_LABEL_INTERNAL_OFFSET_MM === 4, 'offset interno 4mm');
  assert(MEASURE_LABEL_EXTERNAL_OFFSET_MM === 4, 'offset externo 4mm');
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
  assert(pos.offsetUsed >= 4, `offset >= 4: ${pos.offsetUsed}`);
  assert(pos.y >= 34, `medida afastada da divisa: y=${pos.y}`);
  console.log('OK testResolveMeasureLabelPositionClearance');
}

function testPlaceLotNumberAndAreaGap() {
  const verts = rectVerts();
  const layout = placeLotNumberAndArea(verts, '2.727,00 m²', [], {
    crossWidthMm: 50,
    inwardDepthMm: 40,
    narrow: false,
    vertexCount: 4,
  });
  assert(
    layout.numberAreaGapMm >= LOT_NUMBER_AREA_MIN_GAP_MM - 0.5,
    `gap número×área >= 15mm: ${layout.numberAreaGapMm}`,
  );
  assert(
    layout.areaPos[1] > layout.badgePos[1] + layout.badgeRadius,
    'área abaixo do número',
  );
  console.log('OK testPlaceLotNumberAndAreaGap');
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
  assert(SIGEF_SCALE_BAR_MIN_W_MM === 80, 'escala min 80mm');
  assert(SIGEF_SCALE_BAR_H_MM === 6, 'escala altura 6mm');
  console.log('OK testSigefScaleBarConstants');
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
  const doc = await generateLotSheetPdf(await buildPdfPayload(b, c));
  assert(doc.getNumberOfPages() >= 1, 'pdf lote 018');
  console.log('OK testPdfLot018');
}

async function main() {
  testMeasureLabelOffsetConstants();
  testResolveMeasureLabelPositionClearance();
  testPlaceLotNumberAndAreaGap();
  testVertexLabelSpacing();
  testSigefRegionsConfrontationsTableGap();
  testSigefScaleBarConstants();
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
