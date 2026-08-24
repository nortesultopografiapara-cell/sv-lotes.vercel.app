/**
 * Aba Confrontações: lista = todas as arestas da geometria/segments_json.
 * npx tsx scripts/mandatory-lot-confrontations-all-segments-tests.ts
 */
import {
  buildLotConfrontationAudit,
  buildOfficialLotConfrontationSegmentRows,
  buildCompleteLotConfrontationSegmentRows,
  UNCLASSIFIED_CONFRONTATION_ROLE,
  UNCLASSIFIED_SIDE_LABEL,
  UNCLASSIFIED_CONFRONTANT_LABEL,
  officialSegmentIndexesForSide,
} from '../lib/assistedConfrontation';
import { loadLotConfrontations } from '../lib/lotConfrontationsPanel';
import { parseOfficialSegmentsFromBlock } from '../lib/officialLotMeasurements';
import fs from 'node:fs';
import path from 'node:path';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function near(a: number, b: number, tol = 0.02): boolean {
  return Math.abs(a - b) <= tol;
}

const TEST_LENGTHS = [
  24.704, 10.274, 14.403, 53.21, 19.825, 49.818, 23.166, 2.961, 3.491, 44.835,
  55.065,
];
const TEST_PERIMETER = 301.752;

function lineSeg(
  idx: number,
  distance: number,
  officialSide?: string,
): Record<string, unknown> {
  let e = 0;
  for (let i = 0; i < idx; i++) e += TEST_LENGTHS[i] ?? 0;
  const row: Record<string, unknown> = {
    segment_index: idx,
    north: 0,
    east: e,
    end_north: 0,
    end_east: e + distance,
    distance,
    segment_type: 'LINE',
  };
  if (officialSide) row.official_side = officialSide;
  return row;
}

function elevenSegmentLot(): Record<string, unknown> {
  const sides = [
    'front',
    undefined,
    undefined,
    'right',
    'right',
    'back',
    'left',
    undefined,
    undefined,
    'right',
    'left',
  ] as const;
  return {
    id: 'lot-11',
    number: '35',
    block_name: '02',
    front_segment_index: 0,
    segments_json: TEST_LENGTHS.map((d, i) => lineSeg(i, d, sides[i])),
  };
}

function nGonLot(n: number, id: string): Record<string, unknown> {
  const segs: Record<string, unknown>[] = [];
  for (let i = 0; i < n; i++) {
    segs.push({
      segment_index: i,
      north: i,
      east: 0,
      end_north: i,
      end_east: 10,
      distance: 10,
      segment_type: 'LINE',
      ...(i === 0
        ? { official_side: 'front' }
        : i === Math.floor(n / 2)
          ? { official_side: 'back' }
          : {}),
    });
  }
  return { id, number: String(n), block_name: '01', segments_json: segs };
}

function diagnose(lot: Record<string, unknown>) {
  const parsed = parseOfficialSegmentsFromBlock(lot);
  const audit = buildLotConfrontationAudit(lot, String(lot.id), [lot], []);
  const officialRows = buildOfficialLotConfrontationSegmentRows(
    lot,
    audit,
    [lot],
  );
  const completeRows = buildCompleteLotConfrontationSegmentRows(
    lot,
    audit,
    [lot],
  );
  const loaded = loadLotConfrontations({ lot, allBlocks: [lot], streetGuides: [] });
  const sideUnion = new Set<number>([
    ...officialSegmentIndexesForSide(lot, [lot], 'frente'),
    ...officialSegmentIndexesForSide(lot, [lot], 'fundo'),
    ...officialSegmentIndexesForSide(lot, [lot], 'ladoDireito'),
    ...officialSegmentIndexesForSide(lot, [lot], 'ladoEsquerdo'),
  ]);
  return { parsed, audit, officialRows, completeRows, loaded, sideUnion };
}

function testElevenBecomesSevenAtOfficialSideFilter() {
  const lot = elevenSegmentLot();
  const d = diagnose(lot);
  assert(d.parsed.length === 11, `parsed=${d.parsed.length} esperado 11`);
  assert(
    d.sideUnion.size === 7,
    `union lados oficiais=${d.sideUnion.size} esperado 7 (etapa do corte)`,
  );
  const officialReal = d.officialRows.filter((r) => r.segmentIndex >= 0);
  assert(
    officialReal.length === 7,
    `rows oficiais=${officialReal.length} — corte em buildOfficialLotConfrontationSegmentRows (só 4 lados)`,
  );
  assert(d.completeRows.length === 11, `lista completa=${d.completeRows.length}`);
  assert(d.loaded.rows.length === 11, `loadLotConfrontations=${d.loaded.rows.length}`);
  console.log('OK corte diagnosticado: 11 parsed → 7 pelos 4 lados → 11 na lista', {
    parsed: d.parsed.length,
    officialSideUnion: d.sideUnion.size,
    officialRows: officialReal.length,
    completeRows: d.completeRows.length,
    loaded: d.loaded.rows.length,
  });
}

function testElevenCardsAndPerimeter() {
  const lot = elevenSegmentLot();
  const d = diagnose(lot);
  const byIdx = new Map(d.completeRows.map((r) => [r.segmentIndex, r]));
  for (let i = 0; i < 11; i++) {
    assert(byIdx.has(i), `falta Seg. ${i + 1}`);
    assert(d.loaded.rows.some((r) => r.segmentIndex === i), `load falta Seg. ${i + 1}`);
  }
  assert(near(d.parsed[7].distance, 2.961), `Seg.8 dist=${d.parsed[7].distance}`);
  assert(near(d.parsed[8].distance, 3.491), `Seg.9 dist=${d.parsed[8].distance}`);
  assert(near(d.parsed[9].distance, 44.835), `Seg.10 dist=${d.parsed[9].distance}`);
  assert(near(d.parsed[10].distance, 55.065), `Seg.11 dist=${d.parsed[10].distance}`);
  const sum = d.parsed.reduce((acc, s) => acc + Number(s.distance), 0);
  assert(near(sum, TEST_PERIMETER, 0.02), `soma=${sum} esperado ${TEST_PERIMETER}`);
  const unclass = d.completeRows.filter(
    (r) => r.key === UNCLASSIFIED_CONFRONTATION_ROLE,
  );
  assert(unclass.length === 4, `órfãos visíveis=${unclass.length}`);
  for (const row of unclass) {
    assert(row.sideLabel === UNCLASSIFIED_SIDE_LABEL, 'rótulo SEM CLASSIFICAÇÃO');
    assert(
      row.text === UNCLASSIFIED_CONFRONTANT_LABEL,
      `confrontante órfão: ${row.text}`,
    );
  }
  assert(d.completeRows[7].segmentIndex === 7, 'Seg.8 permanece índice 7');
  assert(d.completeRows[10].segmentIndex === 10, 'Seg.11 permanece índice 10');
  console.log('OK 11/11 + perímetro', { sum, unclass: unclass.length });
}

function testDynamicCounts() {
  for (const n of [3, 4, 11, 20, 30, 50]) {
    const lot = nGonLot(n, `n-${n}`);
    const d = diagnose(lot);
    assert(
      d.parsed.length === n,
      `${n}: parsed=${d.parsed.length}`,
    );
    assert(
      d.completeRows.length === n,
      `${n}: complete=${d.completeRows.length}`,
    );
    assert(
      d.loaded.rows.length === n,
      `${n}: loaded=${d.loaded.rows.length}`,
    );
    assert(
      d.officialRows.filter((r) => r.segmentIndex >= 0).length < n || n <= 4,
      `${n}: filtro oficial não pode ser a lista da aba`,
    );
  }
  console.log('OK contagens dinâmicas 3/4/11/20/30/50');
}

function testOfficialSideSummingUnchanged() {
  const lot = elevenSegmentLot();
  const frente = officialSegmentIndexesForSide(lot, [lot], 'frente');
  const fundo = officialSegmentIndexesForSide(lot, [lot], 'fundo');
  const dir = officialSegmentIndexesForSide(lot, [lot], 'ladoDireito');
  const esq = officialSegmentIndexesForSide(lot, [lot], 'ladoEsquerdo');
  assert(JSON.stringify(frente) === JSON.stringify([0]), `frente=${frente}`);
  assert(JSON.stringify(fundo) === JSON.stringify([5]), `fundo=${fundo}`);
  assert(JSON.stringify(dir) === JSON.stringify([3, 4, 9]), `dir=${dir}`);
  assert(JSON.stringify(esq) === JSON.stringify([6, 10]), `esq=${esq}`);
  console.log('OK soma/índices oficiais por lado inalterados', {
    frente,
    fundo,
    dir,
    esq,
  });
}

function testNoHardcodedLimitInSources() {
  const files = [
    'lib/lotConfrontationsPanel.ts',
    'lib/assistedConfrontation.ts',
    'components/map/LotConfrontationsPanel.tsx',
  ];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
    assert(!src.includes('.slice(0, 11)'), `${rel} slice 11`);
    assert(!src.includes('.slice(0,11)'), `${rel} slice11`);
    assert(!/\.length\s*>\s*11/.test(src), `${rel} length>11`);
    assert(!src.includes('MAX_SEGMENTS'), `${rel} MAX_SEGMENTS`);
  }
  const panel = fs.readFileSync(
    path.join(process.cwd(), 'lib/lotConfrontationsPanel.ts'),
    'utf8',
  );
  assert(
    panel.includes('buildCompleteLotConfrontationSegmentRows'),
    'load usa lista completa',
  );
  assert(
    panel.includes('buildOfficialLotConfrontationSegmentRows'),
    'builder oficial permanece referenciado',
  );
  const ui = fs.readFileSync(
    path.join(process.cwd(), 'components/map/LotConfrontationsPanel.tsx'),
    'utf8',
  );
  assert(ui.includes('overflow-y-auto'), 'lista com scroll interno');
  assert(!ui.includes('.slice('), 'UI não fatia a lista');
  console.log('OK sem limite fixo / scroll interno');
}

function main() {
  testElevenBecomesSevenAtOfficialSideFilter();
  testElevenCardsAndPerimeter();
  testDynamicCounts();
  testOfficialSideSummingUnchanged();
  testNoHardcodedLimitInSources();
  console.log('\nALL mandatory-lot-confrontations-all-segments-tests PASSED');
}

main();
