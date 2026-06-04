/**
 * MEM-001 — memorial descritivo
 * npx tsx scripts/mandatory-memorial-description-tests.ts
 */

import { formatAzimuthDms } from '../lib/azimuthFormat';
import { PENDING_CONFRONTANT_LABEL } from '../lib/confrontantTypes';
import {
  buildMemorialSegments,
  getOfficialSegmentTableForMemorial,
} from '../lib/memorial/memorialGeometry';
import {
  memorialHasPendingConfrontations,
  resolveMemorialSegmentConfrontant,
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
import { buildLotConfrontationAudit } from '../lib/assistedConfrontation';
import { buildMemorialSideSummaryFromAudit } from '../lib/memorial/memorialConfrontants';
import { applyConfrontantToSegmentRows } from '../lib/segmentConfrontantPersist';

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
  assert(segs[0]!.fromVertex === 'V-01', segs[0]!.fromVertex);
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

function testClosesAtV01() {
  const block = lotBlock('01', 4);
  const segs = buildMemorialSegments(block, block.id as string, [block], []);
  const text = buildMemorialDescriptionText(segs);
  assert(/V-01/.test(text), 'menciona V-01');
  assert(/ponto inicial/.test(text), 'fecha no início');
  const paras = buildMemorialDescriptionParagraphs(segs);
  assert(paras[paras.length - 2]!.includes('V-01'), 'último trecho fecha');
  console.log('OK testClosesAtV01');
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
  const segs = buildMemorialSegments(block, block.id as string, [block], []);
  assert(
    memorialHasPendingConfrontations(segs, null),
    'sem guia → pendente',
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
  assert(memorialVertexLabel(0) === 'V-01', 'v01');
  assert(memorialVertexLabel(99) === 'V-100', 'v100');
  console.log('OK testVertexLabels');
}

function testSigefGrouping() {
  const segs = [
    {
      segmentIndex: 0,
      fromVertex: 'V-01',
      toVertex: 'V-02',
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
      fromVertex: 'V-02',
      toVertex: 'V-03',
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
      fromVertex: 'V-03',
      toVertex: 'V-04',
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

testFourVertices();
testManyVertices();
testClosesAtV01();
testManualConfrontant();
testStreetName();
testPendingWarning();
testCoordFormat();
testAzimuthDms();
testBrFormats();
testVertexLabels();
testSigefGrouping();
testAuditMatchesPopupSides();
console.log('mandatory-memorial-description-tests: all passed');
