/**
 * MEM-001 — memorial descritivo
 * npx tsx scripts/mandatory-memorial-description-tests.ts
 */

import { formatAzimuthDms } from '../lib/azimuthFormat';
import {
  concatDistinctSideConfrontants,
  PENDING_CONFRONTANT_LABEL,
} from '../lib/confrontantTypes';
import {
  buildMemorialSegments,
  getOfficialSegmentTableForMemorial,
} from '../lib/memorial/memorialGeometry';
import {
  memorialHasPendingConfrontations,
  resolveMemorialSegmentConfrontant,
  buildMemorialSideSummaryFromAudit,
} from '../lib/memorial/memorialConfrontants';
import {
  buildMemorialPayloadFromRecords,
} from '../lib/memorial/memorialData';
import {
  generateMemorialPdf,
  memorialPdfTextContent,
} from '../lib/memorial/memorialPdf';
import { buildOfficialLotDocumentBundle } from '../lib/officialLotDocumentData';
import { getOfficialLotSegmentTable } from '../lib/officialLotMeasurements';
import {
  buildOfficialLotConfrontationSegmentRows,
  applyManualConfrontantToBlock,
  officialSegmentIndexesForSide,
} from '../lib/assistedConfrontation';
import {
  memorialHasPendingConfrontations,
  officialPopupConfrontationsPending,
} from '../lib/memorial/memorialConfrontants';
import {
  formatMemorialAreaM2,
  formatMemorialCoord,
  formatMemorialDistanceM,
  memorialVertexLabel,
} from '../lib/memorial/memorialFormat';
import {
  buildMemorialDescriptionText,
  buildMemorialDescriptionParagraphs,
  MEMORIAL_PENDING_CONFIRM_MESSAGE,
} from '../lib/memorial/memorialText';
import {
  buildLotConfrontationAudit,
  confrontantsFromAudit,
} from '../lib/assistedConfrontation';
import { applyConfrontantToSegmentRows } from '../lib/segmentConfrontantPersist';
import { confrontantsForSide } from '../lib/lotSegmentConfrontation';
import { mergeCurvedSegments } from '../utils/calculateLotDimensions';
import {
  planarBearingDeg,
  planarDistanceM,
  utmRingToClosedCoords,
} from '../lib/officialConfrontationRing';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const BASE_EAST = 50000;
const BASE_NORTH = 7500000;

function utmRectSegments(
  count: number,
  w = 12,
  h = 25,
): Record<string, unknown>[] {
  const e1 = BASE_EAST + w;
  const n1 = BASE_NORTH + h;
  const corners = [
    { n: BASE_NORTH, e: BASE_EAST },
    { n: BASE_NORTH, e: e1 },
    { n: n1, e: e1 },
    { n: n1, e: BASE_EAST },
  ];
  const segs: Record<string, unknown>[] = [];
  for (let i = 0; i < count; i++) {
    const a = corners[i % 4];
    const b = corners[(i + 1) % 4];
    const dist =
      i % 2 === 0
        ? w
        : h;
    segs.push({
      segment_index: i,
      vertex_order: i % 4,
      north: a.n,
      east: a.e,
      end_north: b.n,
      end_east: b.e,
      distance: dist,
      segment_type: 'LINE',
    });
  }
  return segs;
}

function lotBlock(num: string, segCount: number, extra: Record<string, unknown> = {}) {
  return {
    id: `lot-${num}`,
    number: num,
    block_name: '02',
    front_segment_index: 0,
    segments_json: utmRectSegments(segCount),
    area: 2508.15,
    perimeter: 249.31,
    ...extra,
  };
}

function testFourVertices() {
  const block = lotBlock('01', 4);
  const segs = buildMemorialSegments(block, block.id as string, [block], []);
  assert(segs.length === 4, `4 seg, got ${segs.length}`);
  assert(segs[0]!.fromVertex === 'M-01', segs[0]!.fromVertex);
  console.log('OK testFourVertices');
}

function testManyVertices() {
  const block = lotBlock('big', 12);
  const segs = buildMemorialSegments(block, block.id as string, [block], []);
  assert(segs.length === 12, `12 seg, got ${segs.length}`);
  const block100 = lotBlock('100', 100);
  const table = getOfficialSegmentTableForMemorial(block100);
  assert(table.validRows.length === 100, `100 rows, got ${table.validRows.length}`);
  const block1k = lotBlock('1k', 1000);
  const table1k = getOfficialSegmentTableForMemorial(block1k);
  assert(
    table1k.validRows.length === 1000,
    `1000 rows, got ${table1k.validRows.length}`,
  );
  console.log('OK testManyVertices');
}

function testClosesAtM01() {
  const block = lotBlock('01', 4);
  const segs = buildMemorialSegments(block, block.id as string, [block], []);
  const text = buildMemorialDescriptionText(segs);
  assert(/M-01/.test(text), 'menciona M-01');
  assert(!/V-01/.test(text), 'nao usa V-01');
  assert(/ponto inicial/.test(text), 'fecha no início');
  const paras = buildMemorialDescriptionParagraphs(segs);
  assert(paras[paras.length - 2]!.includes('M-01'), 'último trecho fecha');
  console.log('OK testClosesAtM01');
}

function testManualConfrontant() {
  const block = lotBlock('01', 4);
  const updated = {
    ...block,
    segments_json: applyConfrontantToSegmentRows(
      block,
      [1],
      'Área Remanescente',
      'remnant_area',
      'manual',
    ),
  };
  const c = resolveMemorialSegmentConfrontant(
    updated,
    1,
    'lado_direito',
    null,
    [],
    [updated],
  );
  assert(c.label === 'Área Remanescente', c.label);
  assert(c.source === 'manual', c.source);
  console.log('OK testManualConfrontant');
}

function testStreetName() {
  const block = lotBlock('01', 4, {
    front_street_name: 'RUA INTERNA 01',
    front_street_type: 'Rua',
  });
  const c = resolveMemorialSegmentConfrontant(block, 0, 'frente', null, [], [block]);
  assert(/INTERNA\s*01/i.test(c.label), c.label);
  console.log('OK testStreetName');
}

function testPendingWarning() {
  const block = lotBlock('77', 4);
  const audit = buildLotConfrontationAudit(block, block.id as string, [block], []);
  assert(
    memorialHasPendingConfrontations(block, audit, [block]),
    'sem confrontante oficial → pendente',
  );
  assert(MEMORIAL_PENDING_CONFIRM_MESSAGE.includes('pendentes'), 'msg aviso');
  console.log('OK testPendingWarning');
}

function testCoordFormat() {
  const s = formatMemorialCoord(9320499.7011);
  assert(s.includes(',') && s.includes('m'), s);
  console.log('OK testCoordFormat');
}

function testAzimuthDms() {
  const a = formatAzimuthDms(115.730555);
  assert(/°/.test(a) && /'/.test(a) && /"/.test(a), a);
  console.log('OK testAzimuthDms');
}

function testBrFormats() {
  assert(formatMemorialDistanceM(25.26).includes('25,26'), 'dist');
  assert(formatMemorialAreaM2(2508.15).includes('m²'), 'area');
  console.log('OK testBrFormats');
}

function testVertexLabels() {
  assert(memorialVertexLabel(0) === 'M-01', 'm01');
  assert(memorialVertexLabel(99) === 'M-100', 'm100');
  console.log('OK testVertexLabels');
}

function testSigefGrouping() {
  const segs = [
    {
      segmentIndex: 0,
      fromVertex: 'M-01',
      toVertex: 'M-02',
      coordNStart: '1',
      coordEStart: '2',
      coordNEnd: '3',
      coordEEnd: '4',
      azimuth: "90°00'00\"",
      distanceM: 10,
      distanceLabel: '10,00 m',
      confrontant: 'LOTE 05',
      confrontantSource: 'neighbor' as const,
      isCurve: false,
      curveDescription: null,
      northStart: 0,
      eastStart: 0,
      northEnd: 0,
      eastEnd: 10,
    },
    {
      segmentIndex: 1,
      fromVertex: 'M-02',
      toVertex: 'M-03',
      coordNStart: '3',
      coordEStart: '4',
      coordNEnd: '5',
      coordEEnd: '6',
      azimuth: "180°00'00\"",
      distanceM: 12,
      distanceLabel: '12,00 m',
      confrontant: 'LOTE 05',
      confrontantSource: 'neighbor' as const,
      isCurve: false,
      curveDescription: null,
      northStart: 0,
      eastStart: 10,
      northEnd: 10,
      eastEnd: 10,
    },
    {
      segmentIndex: 2,
      fromVertex: 'M-03',
      toVertex: 'M-04',
      coordNStart: '5',
      coordEStart: '6',
      coordNEnd: '7',
      coordEEnd: '8',
      azimuth: "270°00'00\"",
      distanceM: 10,
      distanceLabel: '10,00 m',
      confrontant: 'RUA TESTE',
      confrontantSource: 'street_guide' as const,
      isCurve: false,
      curveDescription: null,
      northStart: 10,
      eastStart: 10,
      northEnd: 10,
      eastEnd: 0,
    },
  ];
  const paras = buildMemorialDescriptionParagraphs(segs);
  const joined = paras.join('\n');
  assert(/seguintes azimutes e distâncias/i.test(joined), 'agrupa LOTE 05');
  assert(/LOTE 05/.test(joined), 'menciona confrontante agrupado');
  assert(/RUA TESTE/.test(joined), 'rua em trecho separado');
  console.log('OK testSigefGrouping');
}

function testConcatDistinctSideConfrontants() {
  assert(
    concatDistinctSideConfrontants(['Lote 03', 'Lote 05', 'Área Institucional']) ===
      'Lote 03 / Lote 05 / Área Institucional',
    'concatena distintos',
  );
  assert(
    concatDistinctSideConfrontants(['Lote 03', 'lote 03', 'Lote 05']) ===
      'Lote 03 / Lote 05',
    'remove duplicados',
  );
  console.log('OK testConcatDistinctSideConfrontants');
}

/** QA-005: lateral com múltiplos confrontantes preserva todos no resumo. */
function testMultiConfrontantsPerSide() {
  const base = lotBlock('12', 4);
  const rows1 = applyConfrontantToSegmentRows(
    base,
    [1],
    'Lote 03',
    'lot',
    'manual',
  );
  const rows2 = applyConfrontantToSegmentRows(
    { ...base, segments_json: rows1 },
    [2],
    'Área Institucional',
    'institutional_area',
    'manual',
  );
  const block = { ...base, segments_json: rows2 };

  const ring: [number, number][] = [
    [BASE_EAST, BASE_NORTH],
    [BASE_EAST + 12, BASE_NORTH],
    [BASE_EAST + 12, BASE_NORTH + 25],
    [BASE_EAST, BASE_NORTH + 25],
  ];
  const coords = utmRingToClosedCoords(ring);
  const raw: import('../utils/calculateLotDimensions').Segment[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];
    raw.push({
      p1,
      p2,
      length: planarDistanceM(p1, p2),
      azimuth: planarBearingDeg(p1, p2),
      originalIndex: i,
      isExternal: true,
    });
  }
  const segments = mergeCurvedSegments(raw, 20);

  const sideResult = confrontantsForSide(
    [1, 2],
    segments,
    [block],
    block,
    block.id as string,
    [coords],
    null,
    'ladoDireito',
    [],
  );
  assert(
    sideResult.label === 'Lote 03 / Área Institucional',
    `lado multi: ${sideResult.label}`,
  );
  assert(!sideResult.pending, 'lado resolvido');

  const audit = buildLotConfrontationAudit(block, block.id as string, [block], []);
  const sheetSides = confrontantsFromAudit(audit);
  assert(sheetSides.ladoDireito === 'Lote 03', `dir ${sheetSides.ladoDireito}`);
  assert(
    sheetSides.fundo === 'Área Institucional',
    `fundo ${sheetSides.fundo}`,
  );

  const seg1 = audit.segmentEdges.find((e) => e.segmentIndex === 1);
  const seg2 = audit.segmentEdges.find((e) => e.segmentIndex === 2);
  assert(seg1?.confrontant === 'Lote 03', `seg1 ${seg1?.confrontant}`);
  assert(
    seg2?.confrontant === 'Área Institucional',
    `seg2 ${seg2?.confrontant}`,
  );

  const memorialSegs = buildMemorialSegments(block, block.id as string, [block], []);
  const m1 = memorialSegs.find((s) => s.segmentIndex === 1);
  const m2 = memorialSegs.find((s) => s.segmentIndex === 2);
  assert(m1?.confrontant === 'Lote 03', `mem seg1 ${m1?.confrontant}`);
  assert(m2?.confrontant === 'Área Institucional', `mem seg2 ${m2?.confrontant}`);

  console.log('OK testMultiConfrontantsPerSide');
}

/** QA-006: prancha PDF deve usar os mesmos confrontantes do memorial (auditoria). */
function testLotSheetConfrontantsMatchMemorialAudit() {
  const base = lotBlock('12', 4, {
    front_segment_index: 0,
    front_street_name: 'RUA ACESSO',
    front_street_type: 'Rua',
  });
  const lot = {
    ...base,
    segments_json: applyConfrontantToSegmentRows(
      base,
      [2],
      'Lote 02',
      'lot',
      'manual',
    ),
  };
  const audit = buildLotConfrontationAudit(lot, lot.id as string, [lot], []);
  const sheetSides = confrontantsFromAudit(audit, {
    block: lot,
    allBlocks: [lot],
  });
  const memorialSummary = buildMemorialSideSummaryFromAudit(
    audit,
    '—',
    lot,
    [lot],
    {},
  );
  for (const key of [
    'frente',
    'fundo',
    'ladoDireito',
    'ladoEsquerdo',
  ] as const) {
    assert(
      sheetSides[key] === memorialSummary[key],
      `prancha/memorial divergem em ${key}: ${sheetSides[key]} vs ${memorialSummary[key]}`,
    );
  }
  assert(sheetSides.fundo === 'Lote 02', `fundo prancha ${sheetSides.fundo}`);
  console.log('OK testLotSheetConfrontantsMatchMemorialAudit');
}

function testAuditMatchesPopupSides() {
  const base = lotBlock('01', 4, {
    front_segment_index: 0,
    front_street_name: 'RUA ACESSO',
    front_street_type: 'Rua',
  });
  const lot1 = {
    ...base,
    segments_json: applyConfrontantToSegmentRows(
      base,
      [2],
      'Lote 02',
      'lot',
      'manual',
    ),
  };
  const audit = buildLotConfrontationAudit(lot1, lot1.id as string, [lot1], []);
  const segs = buildMemorialSegments(lot1, lot1.id as string, [lot1], []);
  const summary = buildMemorialSideSummaryFromAudit(audit, '—');
  assert(/ACESSO|Rua/i.test(summary.frente), `frente ${summary.frente}`);
  const fundoSeg = segs.find((s) => s.segmentIndex === 2);
  assert(fundoSeg != null, 'seg fundo');
  assert(fundoSeg!.confrontant === 'Lote 02', `fundo seg ${fundoSeg!.confrontant}`);
  console.log('OK testAuditMatchesPopupSides');
}

function martineLineSeg(
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

function martineNeighbor(
  id: string,
  num: string,
  east: number,
  north: number,
  w: number,
  h: number,
): Record<string, unknown> {
  return {
    id,
    number: num,
    block_name: '02',
    segments_json: [
      martineLineSeg(0, north, east, north, east + w, w),
      martineLineSeg(1, north, east + w, north + h, east + w, h),
      martineLineSeg(2, north + h, east + w, north + h, east, w),
      martineLineSeg(3, north + h, east, north, east, h),
    ],
  };
}

function buildMartineLot01Qd02() {
  const segs = [
    martineLineSeg(0, 7500000, 500000, 7500000, 500100.05, 100.05),
    martineLineSeg(1, 7500000, 500100.05, 7500014.86, 500100.05, 14.86),
    martineLineSeg(2, 7500014.86, 500100.05, 7500021.64, 500106.83, 6.78),
    martineLineSeg(3, 7500021.64, 500106.83, 7500021.64, 500000, 106.83, 'front'),
    martineLineSeg(4, 7500021.64, 500000, 7500197.84, 500000, 176.2),
    martineLineSeg(5, 7500197.84, 500000, 7500197.84, 500069.08, 69.08),
    martineLineSeg(6, 7500197.84, 500069.08, 7500000, 500069.08, 197.84, 'back'),
  ];
  const lot: Record<string, unknown> = {
    id: 'martine-lt01',
    number: '1',
    block_name: '02',
    front_segment_index: 3,
    front_street_name: 'RUA 01',
    area: 6056.14,
    perimeter: 674.44,
    segments_json: segs,
  };
  const lot43 = martineNeighbor('lt43', '43', 500069.08, 7500197.84, 30, 80);
  const lot02 = martineNeighbor('lt02', '2', 500000, 7500021.64, 80, 30);
  const all = [lot, lot43, lot02];

  const frenteIdx = officialSegmentIndexesForSide(lot, all, 'frente');
  const fundoIdx = officialSegmentIndexesForSide(lot, all, 'fundo');
  const dirIdx = officialSegmentIndexesForSide(lot, all, 'ladoDireito');
  const esqIdx = officialSegmentIndexesForSide(lot, all, 'ladoEsquerdo');

  let updated = applyManualConfrontantToBlock(lot, frenteIdx, 'RUA 01', 'street');
  updated = applyManualConfrontantToBlock(updated, fundoIdx, 'Lote 43', 'lot');
  updated = applyManualConfrontantToBlock(updated, dirIdx, 'RUA 02', 'street');
  updated = applyManualConfrontantToBlock(
    updated,
    esqIdx,
    'Lote 02 e 43',
    'lot',
  );
  return { lot: updated, all };
}

/** Sem ReferenceError de officialSegmentIndexesForSide no resumo oficial. */
function testOfficialSegmentIndexesForSideResolved() {
  const { lot, all } = buildMartineLot01Qd02();
  const audit = buildLotConfrontationAudit(lot, 'martine-lt01', all, []);
  const summary = buildMemorialSideSummaryFromAudit(
    audit,
    '6,78 m',
    lot,
    all,
    { name: 'CHACARAS E LOTES MARTINE III', city: 'Parauapebas', uf: 'PA' },
  );
  assert(summary.frente === 'RUA 01', `frente ${summary.frente}`);
  console.log('OK testOfficialSegmentIndexesForSideResolved');
}

/** Memorial LT 01 QD 02 MARTINE III — confrontações alinhadas à prancha. */
function testMartineMemorialConfrontantsMatchSheet() {
  const { lot, all } = buildMartineLot01Qd02();
  const project = {
    name: 'CHACARAS E LOTES MARTINE III',
    city: 'Parauapebas',
    uf: 'PA',
    utm_zone: '22S',
  };
  const bundle = buildOfficialLotDocumentBundle({
    block: lot,
    blockId: 'martine-lt01',
    project,
    allBlocks: all,
  });
  const expected = {
    frente: 'RUA 01',
    fundo: 'Lote 43',
    ladoDireito: 'RUA 02',
    ladoEsquerdo: 'Lote 02 e 43',
  };
  for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
    assert(
      bundle.confrontations[key] === expected[key],
      `${key}: ${bundle.confrontations[key]} !== ${expected[key]}`,
    );
  }
  const payload = buildMemorialPayloadFromRecords({
    block: lot,
    blockId: 'martine-lt01',
    project,
    allBlocks: all,
    streetGuides: [],
    company: {
      name: 'MENESES IMOBILIARIA',
      fantasy_name: 'MENESES',
      phone: '(94) 99999-0000',
      email: 'contato@meneses.com',
      city: 'Parauapebas',
      state: 'PA',
    },
  });
  assert(payload.sides.frente === 'RUA 01', payload.sides.frente);
  assert(payload.sides.fundo === 'Lote 43', payload.sides.fundo);
  assert(payload.sides.ladoDireito === 'RUA 02', payload.sides.ladoDireito);
  assert(
    payload.sides.ladoEsquerdo === 'Lote 02 e 43',
    payload.sides.ladoEsquerdo,
  );
  assert(
    /6,78/.test(payload.sides.chanfre),
    `chanfre ${payload.sides.chanfre}`,
  );
  assert(
    payload.identification.municipality === 'Parauapebas/PA',
    payload.identification.municipality,
  );
  console.log('OK testMartineMemorialConfrontantsMatchSheet');
}

/** Popup GIS — linhas oficiais por segmento (Martine III QD 02 LT 01). */
function testMartineOfficialPopupSegmentRows() {
  const { lot, all } = buildMartineLot01Qd02();
  const audit = buildLotConfrontationAudit(lot, 'martine-lt01', all, []);
  const rows = buildOfficialLotConfrontationSegmentRows(lot, audit, all);
  const bySeg = new Map(
    rows
      .filter((r) => r.segmentIndex >= 0)
      .map((r) => [r.segmentIndex, r]),
  );

  assert(bySeg.get(3)?.text === 'RUA 01', `seg4 frente ${bySeg.get(3)?.text}`);
  assert(bySeg.get(6)?.text === 'Lote 43', `seg7 fundo ${bySeg.get(6)?.text}`);
  assert(bySeg.get(0)?.text === 'RUA 02', `seg1 dir ${bySeg.get(0)?.text}`);
  assert(bySeg.get(2)?.text === 'RUA 02', `seg3 dir ${bySeg.get(2)?.text}`);
  assert(
    bySeg.get(4)?.text === 'Lote 02 e 43',
    `seg5 esq ${bySeg.get(4)?.text}`,
  );

  const dirRows = rows.filter(
    (r) => r.key === 'ladoDireito' && r.segmentIndex >= 0,
  );
  assert(dirRows.length === 2, `dir rows ${dirRows.length}`);
  assert(
    dirRows.every((r) => r.text === 'RUA 02'),
    'lado direito repetido válido',
  );
  console.log('OK testMartineOfficialPopupSegmentRows');
}

/** Memorial não deve alertar pendência quando popup GIS está completo. */
function testMartineMemorialNoPendingAlert() {
  const { lot, all } = buildMartineLot01Qd02();
  const project = {
    name: 'CHACARAS E LOTES MARTINE III',
    city: 'Parauapebas',
    uf: 'PA',
    utm_zone: '22S',
  };
  const audit = buildLotConfrontationAudit(lot, 'martine-lt01', all, []);
  assert(
    !officialPopupConfrontationsPending(lot, audit, all, { project }),
    'popup oficial sem pendência',
  );
  const payload = buildMemorialPayloadFromRecords({
    block: lot,
    blockId: 'martine-lt01',
    project,
    allBlocks: all,
    streetGuides: [],
    company: { name: 'MENESES', fantasy_name: 'MENESES' },
  });
  assert(!payload.hasPendingConfrontations, 'memorial sem pendência');
  assert(payload.pendingWarning == null, 'sem aviso pendente');
  console.log('OK testMartineMemorialNoPendingAlert');
}

/** Descrição perimétrica — sem A DEFINIR quando popup GIS está completo. */
function testMartineMemorialDescriptionNoADefinir() {
  const { lot, all } = buildMartineLot01Qd02();
  const project = {
    name: 'CHACARAS E LOTES MARTINE III',
    city: 'Parauapebas',
    uf: 'PA',
    utm_zone: '22S',
  };
  const payload = buildMemorialPayloadFromRecords({
    block: lot,
    blockId: 'martine-lt01',
    project,
    allBlocks: all,
    streetGuides: [],
    company: { name: 'MENESES', fantasy_name: 'MENESES' },
  });

  assert(
    !/A\s*DEFINIR/i.test(payload.descriptionText),
    `descricao com pendencia: ${payload.descriptionText}`,
  );
  for (const seg of payload.segments) {
    assert(
      !/A\s*DEFINIR/i.test(seg.confrontant),
      `seg ${seg.segmentIndex + 1} ${seg.confrontant}`,
    );
  }
  assert(!payload.hasPendingConfrontations, 'hasPending');
  assert(payload.pendingWarning == null, 'pendingWarning');
  assert(
    !payload.observations.some((o) => /pendente/i.test(o)),
    'obs pendente',
  );
  assert(/RUA 01/i.test(payload.descriptionText), 'rua 01 desc');
  assert(/RUA 02/i.test(payload.descriptionText), 'rua 02 desc');
  assert(/Lote 43/i.test(payload.descriptionText), 'lote 43 desc');
  assert(/Lote 02 e 43/i.test(payload.descriptionText), 'lote 02 e 43 desc');
  console.log('OK testMartineMemorialDescriptionNoADefinir');
}

/** Memorial e prancha — mesma nomenclatura de vértices M-01…M-07 (sem V-). */
function testMartineVertexLabelsMatchPrancha() {
  const { lot, all } = buildMartineLot01Qd02();
  const project = {
    name: 'CHACARAS E LOTES MARTINE III',
    city: 'Parauapebas',
    uf: 'PA',
    utm_zone: '22S',
  };
  const sheetTable = getOfficialLotSegmentTable(lot, project);
  const memorialSegs = buildMemorialSegments(
    lot,
    'martine-lt01',
    all,
    [],
    project,
  );
  const payload = buildMemorialPayloadFromRecords({
    block: lot,
    blockId: 'martine-lt01',
    project,
    allBlocks: all,
    streetGuides: [],
    company: { name: 'MENESES', fantasy_name: 'MENESES' },
  });
  const text = payload.descriptionText;

  for (const row of sheetTable.validRows) {
    const mem = memorialSegs.find((s) => s.segmentIndex === row.segment_index);
    assert(mem != null, `seg ${row.segment_index} ausente no memorial`);
    assert(
      mem!.fromVertex === row.de,
      `de seg ${row.segment_index}: ${mem!.fromVertex} !== ${row.de}`,
    );
    assert(
      mem!.toVertex === row.para,
      `para seg ${row.segment_index}: ${mem!.toVertex} !== ${row.para}`,
    );
  }

  for (const label of ['M-01', 'M-02', 'M-07']) {
    assert(text.includes(label), `memorial contém ${label}`);
  }
  for (const label of ['V-01', 'V-02', 'V-07']) {
    assert(!text.includes(label), `memorial não deve conter ${label}`);
  }

  const sheetVertices = sheetTable.validRows.flatMap((r) => [r.de, r.para]);
  const memorialVertices = memorialSegs.flatMap((s) => [
    s.fromVertex,
    s.toVertex,
  ]);
  assert(
    sheetVertices.join('|') === memorialVertices.join('|'),
    `sequência prancha/memorial diverge: ${sheetVertices.join(',')} vs ${memorialVertices.join(',')}`,
  );
  console.log('OK testMartineVertexLabelsMatchPrancha');
}

/** PDF do memorial — conteúdo e branding da empresa logada. */
async function testMemorialPdfContentAndCompanyBranding() {
  const { lot, all } = buildMartineLot01Qd02();
  const payload = buildMemorialPayloadFromRecords({
    block: lot,
    blockId: 'martine-lt01',
    project: {
      name: 'CHACARAS E LOTES MARTINE III',
      city: 'Parauapebas',
      uf: 'PA',
      utm_zone: '22S',
    },
    allBlocks: all,
    streetGuides: [],
    company: {
      name: 'MENESES IMOBILIARIA LTDA',
      fantasy_name: 'MENESES',
      phone: '(94) 3356-1234',
      email: 'vendas@meneses.com.br',
      website: 'www.meneses.com.br',
      city: 'Parauapebas',
      state: 'PA',
      technical_responsible_name: 'SEVERINO JOSE DE FRANÇA',
      technical_responsible_role: 'TEC. EM AGRIMENSURA',
      technical_responsible_cft: '6508202820',
    },
  });
  payload.generatedAt = '2026-06-08T12:00:00.000Z';

  const doc = await generateMemorialPdf(payload);
  const text = memorialPdfTextContent(doc);
  assert(/MEMORIAL DESCRITIVO/i.test(text), 'titulo');
  assert(/DESCRIÇÃO/i.test(text), 'secao descricao');
  assert(/Inicia-se a descrição deste perímetro/i.test(text), 'inicio narrativa');
  assert(/SIRGAS2000/i.test(text), 'datum');
  assert(/UTM/i.test(text), 'utm');
  assert(!/U\s+T\s+M/.test(text), 'utm quebrado');
  assert(!/Responsável técnico/i.test(text), 'sem label responsavel tecnico');
  assert(/SEVERINO JOSE DE FRANÇA/i.test(text), 'rt nome');
  assert(/TEC\. EM AGRIMENSURA/i.test(text), 'rt titulo');
  assert(/CFT:\s*6508202820/i.test(text), 'rt cft');
  assert(/RUA 01/i.test(text), 'rua 01');
  assert(/RUA 02/i.test(text), 'rua 02');
  assert(/Lote 43/i.test(text), 'lote 43');
  assert(/Lote 02 e 43/i.test(text), 'lote 02 e 43');
  assert(!/A\s*DEFINIR/i.test(text), 'pdf sem a definir');
  assert(!/confronta(ç|c)(ã|a)o pendente/i.test(text), 'pdf sem aviso pendente');
  assert(/MENESES/i.test(text), 'empresa logada');
  assert(!/SV Topografia/i.test(text), 'sem SV Topografia fixa');
  assert(!/Norte.*Sul Topografia/i.test(text), 'sem Norte Sul fixa');
  assert(/planta anexa é parte integrante/i.test(text), 'observacao planta');
  assert(!/domingo/i.test(text), 'sem dia da semana na data');
  assert(/Parauapebas\/PA/i.test(text), 'municipio');
  console.log('OK testMemorialPdfContentAndCompanyBranding');
}

testFourVertices();
testManyVertices();
testClosesAtM01();
testManualConfrontant();
testStreetName();
testPendingWarning();
testCoordFormat();
testAzimuthDms();
testBrFormats();
testVertexLabels();
testSigefGrouping();
testConcatDistinctSideConfrontants();
testMultiConfrontantsPerSide();
testLotSheetConfrontantsMatchMemorialAudit();
testAuditMatchesPopupSides();
testOfficialSegmentIndexesForSideResolved();
testMartineMemorialConfrontantsMatchSheet();
testMartineOfficialPopupSegmentRows();
testMartineMemorialNoPendingAlert();
testMartineMemorialDescriptionNoADefinir();
testMartineVertexLabelsMatchPrancha();
void testMemorialPdfContentAndCompanyBranding().then(() => {
  console.log('mandatory-memorial-description-tests: all passed');
});
