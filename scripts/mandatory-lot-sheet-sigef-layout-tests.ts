/**
 * ETAPA 4 — layout SIGEF/INCRA da prancha PDF.
 * npx tsx scripts/mandatory-lot-sheet-sigef-layout-tests.ts
 */

import { buildLotConfrontationAudit, confrontantsFromAudit } from '../lib/assistedConfrontation';
import { buildOfficialSheetLocalGeometry } from '../lib/lotSheetCoordinates';
import { buildSketchLayoutFromBlock } from '../lib/lotSheetLayout';
import { generateLotSheetPdf } from '../lib/lotSheetPdf';
import type { LotSheetPayload } from '../lib/lotSheetData';
import {
  computeSigefPageRegions,
  formatPerimeterDisplay,
  LOT_SHEET_SIGEF_LAYOUT,
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

function testSigefLayoutFlag() {
  assert(LOT_SHEET_SIGEF_LAYOUT === true, 'SIGEF layout ativo');
  console.log('OK testSigefLayoutFlag');
}

function testSigefRegionsNoOverlap() {
  const regions = computeSigefPageRegions(210, 297, 8);
  assert(regions.sketch.h >= 88, `croqui alto: ${regions.sketch.h}`);
  assert(
    !sigefBoxesOverlap(regions.sketch, regions.confrontations),
    'croqui x confrontações',
  );
  assert(
    !sigefBoxesOverlap(regions.confrontations, regions.coordinates),
    'confrontações x coordenadas',
  );
  assert(
    !sigefBoxesOverlap(regions.coordinates, regions.technical),
    'coordenadas x técnico',
  );
  assert(
    !sigefBoxesOverlap(regions.technical, regions.bottomSplit),
    'técnico x rodapé',
  );
  assert(
    regions.sketchScaleBand.y >= regions.sketch.y,
    'faixa escala dentro do croqui',
  );
  console.log('OK testSigefRegionsNoOverlap');
}

function testPerimeterFromOfficialMeasures() {
  const b = block(
    [
      lineSeg(0, 7500000, 500000, 7500000, 500050, 50, 'front'),
      lineSeg(1, 7500000, 500050, 7500100, 500050, 100, 'back'),
      lineSeg(2, 7500100, 500050, 7500100, 500000, 50, 'right'),
      lineSeg(3, 7500100, 500000, 7500000, 500000, 100, 'left'),
    ],
    { number: '12', front_segment_index: 0, area: 5000 },
  );
  const p = formatPerimeterDisplay(b);
  assert(p.includes('300'), `perímetro retangular: ${p}`);
  console.log('OK testPerimeterFromOfficialMeasures');
}

function testConfrontationsFromAudit() {
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
  assert(c.frente.length > 0, 'frente audit');
  assert(typeof c.fundo === 'string', 'fundo audit');
  console.log('OK testConfrontationsFromAudit');
}

async function buildPayload(
  b: Record<string, unknown>,
  measures: LotSheetPayload['measures'],
  metricCount = 4,
): Promise<LotSheetPayload> {
  const geom = buildOfficialSheetLocalGeometry(b);
  assert(geom != null, 'geometria');
  const layout = buildSketchLayoutFromBlock(b, String(b.id ?? 'test'));
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
    lot: b,
    owner: 'Cliente Teste',
    ownerDocument: '000.000.000-00',
    ownerDetails: {
      name: 'Cliente Teste',
      cpf: '000.000.000-00',
      fatherName: '—',
      motherName: '—',
      address: '—',
      neighborhood: '—',
      municipality: 'Cidade Teste',
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
    metricRows: rows,
    coordinatesAvailable: true,
    frontEdgeIndex: 0,
    quadraStreetNames: [],
    validation: {
      code: 'X',
      url: 'https://x',
      emittedAt: new Date().toISOString(),
    },
    version: 'test',
    geometry: {
      utmRing: geom!.utmRing,
      localRing: geom!.localRing,
      bboxMeters: geom!.bboxMeters,
    },
    measures,
    scaleLabel: '1 : 500',
    sideConfrontants: layout.confrontants,
    lotAddressLine: '—',
    memorialFrontClause: '—',
    memorialTechnicalHtml: '',
    memorialDraftPlain: '',
    officialEdgeLengths: layout.edgeLabels,
    sketchSides: layout.sketchSides,
    ignoredSegmentNote: null,
  } as LotSheetPayload;
}

async function testRectangularLotPdf() {
  const b = block(
    [
      lineSeg(0, 7500000, 500000, 7500000, 500050, 50, 'front'),
      lineSeg(1, 7500000, 500050, 7500100, 500050, 100, 'back'),
      lineSeg(2, 7500100, 500050, 7500100, 500000, 50, 'right'),
      lineSeg(3, 7500100, 500000, 7500000, 500000, 100, 'left'),
    ],
    { id: 'rect', number: '12', block_name: '02', front_segment_index: 0, area: 5000 },
  );
  const doc = await generateLotSheetPdf(
    await buildPayload(b, {
      frente: '50,00 m',
      fundo: '50,00 m',
      ladoDireito: '100,00 m',
      ladoEsquerdo: '100,00 m',
      chanfre: '—',
      curva: '—',
      raio: '—',
      corda: '—',
      area: '5.000,00 m²',
    }),
  );
  assert(doc.getNumberOfPages() >= 1, 'pdf retangular');
  console.log('OK testRectangularLotPdf');
}

async function testIrregularLotPdf() {
  const b = block(
    [
      lineSeg(0, 7500000, 500000, 7500000, 500030.62, 30.62, 'front'),
      lineSeg(1, 7500000, 500030.62, 7500060.74, 500030.62, 60.74),
      lineSeg(2, 7500060.74, 500030.62, 7500065.87, 500035.75, 7.26, 'right'),
      lineSeg(3, 7500065.87, 500035.75, 7500087.25, 500057.13, 28.54),
      lineSeg(4, 7500087.25, 500057.13, 7500087.25, 500037.65, 19.48),
      lineSeg(5, 7500087.25, 500037.65, 7500087.25, 500030.62, 12.37),
      lineSeg(6, 7500087.25, 500030.62, 7500000, 500030.62, 87.25),
    ],
    { id: 'irr', number: '010', block_name: '02', front_segment_index: 0, area: 2727 },
  );
  const doc = await generateLotSheetPdf(
    await buildPayload(
      b,
      {
        frente: '30,62 m',
        fundo: '31,85 m',
        ladoDireito: '96,54 m',
        ladoEsquerdo: '87,25 m',
        chanfre: '—',
        curva: '—',
        raio: '—',
        corda: '—',
        area: '2.727,13 m²',
      },
      7,
    ),
  );
  assert(doc.getNumberOfPages() >= 1, 'pdf irregular');
  console.log('OK testIrregularLotPdf');
}

async function testChanfreLotPdf() {
  const b = block(
    [
      lineSeg(0, 7500000, 500000, 7500012, 500000, 12, 'front'),
      lineSeg(1, 7500012, 500000, 7500025, 500000, 13),
      lineSeg(2, 7500025, 500000, 7500025, 500025, 25, 'right'),
      lineSeg(3, 7500025, 500025, 7500000, 500025, 25, 'back'),
      lineSeg(4, 7500000, 500025, 7500000, 500000, 25, 'left'),
    ],
    { id: 'chanfre', number: '05', block_name: '01', front_segment_index: 0, area: 625 },
  );
  const doc = await generateLotSheetPdf(
    await buildPayload(
      b,
      {
        frente: '25,00 m',
        fundo: '25,00 m',
        ladoDireito: '25,00 m',
        ladoEsquerdo: '25,00 m',
        chanfre: '5,00 m',
        curva: '—',
        raio: '—',
        corda: '—',
        area: '625,00 m²',
      },
      5,
    ),
  );
  assert(doc.getNumberOfPages() >= 1, 'pdf chanfre');
  console.log('OK testChanfreLotPdf');
}

async function testManySegmentsLotPdf() {
  const b = block(
    [
      lineSeg(0, 7500000, 500000, 7500000, 500178.97, 178.97),
      lineSeg(1, 7500000, 500178.97, 7500072.09, 500178.97, 72.09),
      lineSeg(2, 7500072.09, 500178.97, 7500072.09, 500170.97, 8),
      lineSeg(3, 7500072.09, 500170.97, 7500349.06, 500170.97, 277.08),
      lineSeg(4, 7500349.06, 500170.97, 7500349.06, 500132.97, 38),
      lineSeg(5, 7500349.06, 500132.97, 7500310.57, 500000, 38.49),
      lineSeg(6, 7500310.57, 500000, 7500000, 500000, 58.68),
    ],
    {
      id: 'many',
      number: '018',
      block_name: '03',
      front_segment_index: 0,
      front_street_name: 'RUA MARGINAL FERROVIA',
      area: 20013,
    },
  );
  const doc = await generateLotSheetPdf(
    await buildPayload(
      b,
      {
        frente: '178,97 m',
        fundo: '277,08 m',
        ladoDireito: '58,68 m',
        ladoEsquerdo: '72,09 m',
        chanfre: '—',
        curva: '—',
        raio: '—',
        corda: '—',
        area: '20.013,61 m²',
      },
      7,
    ),
  );
  assert(doc.getNumberOfPages() >= 1, 'pdf muitos segmentos');
  console.log('OK testManySegmentsLotPdf');
}

async function main() {
  testSigefLayoutFlag();
  testSigefRegionsNoOverlap();
  testPerimeterFromOfficialMeasures();
  testConfrontationsFromAudit();
  await testRectangularLotPdf();
  await testIrregularLotPdf();
  await testChanfreLotPdf();
  await testManySegmentsLotPdf();
  console.log('mandatory-lot-sheet-sigef-layout-tests: all passed');
}

void main();
