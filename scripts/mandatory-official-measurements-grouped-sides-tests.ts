/**
 * ETAPA 2.1 — medidas oficiais agrupadas por lado (segments_json TXT).
 * npx tsx scripts/mandatory-official-measurements-grouped-sides-tests.ts
 */

import {
  getOfficialLotMeasurements,
  type OfficialLotMeasures,
} from '../lib/officialLotMeasurements';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function near(a: number | null | undefined, b: number, tol = 0.06): boolean {
  return a != null && Number.isFinite(a) && Math.abs(a - b) <= tol;
}

function block(
  segments: Record<string, unknown>[],
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    number: 'T',
    area: 1000,
    segments_json: segments,
    ...extra,
  };
}

function lineSeg(
  idx: number,
  north: number,
  east: number,
  endNorth: number,
  endEast: number,
  distance: number,
) {
  return {
    segment_index: idx,
    north,
    east,
    end_north: endNorth,
    end_east: endEast,
    distance,
    segment_type: 'LINE',
  };
}

/** 1. Retângulo simples — 1 segmento por lado. */
function testRectangularSingleSegmentPerSide() {
  const segs = [
    lineSeg(0, 0, 0, 0, 50, 50),
    lineSeg(1, 0, 50, 100, 50, 100),
    lineSeg(2, 100, 50, 100, 0, 50),
    lineSeg(3, 100, 0, 0, 0, 100),
  ];
  const m = getOfficialLotMeasurements(
    block(segs, { front_segment_index: 0, frente: 50 }),
    'RECT',
  );
  assert(near(m.frente, 50), `frente ${m.frente}`);
  assert(near(m.fundo, 50), `fundo ${m.fundo}`);
  assert(near(m.ladoDireito, 100), `dir ${m.ladoDireito}`);
  assert(near(m.ladoEsquerdo, 100), `esq ${m.ladoEsquerdo}`);
  assert(m.sides?.back.segmentIndexes.length === 1, 'fundo 1 seg');
  console.log('OK testRectangularSingleSegmentPerSide');
}

/** 2. Fundo quebrado — 2 segmentos no fundo (frente para rua, residual). */
function testBrokenBackTwoSegments() {
  const segs = [
    lineSeg(0, 0, 0, 0, 20, 20),
    lineSeg(1, 0, 20, 3, 23, 3),
    lineSeg(2, 3, 23, 3, 63, 40),
    lineSeg(3, 3, 63, 0, 63, 20),
    lineSeg(4, 0, 63, 0, 43, 20),
    lineSeg(5, 0, 43, 0, 0, 43),
  ];
  const m = getOfficialLotMeasurements(
    block(segs, {
      front_segment_index: 0,
      front_street_name: 'RUA FUNDO',
      frente: 20,
    }),
    'BACK2',
  );
  const backSegs = m.sides?.back.segmentIndexes ?? [];
  assert(backSegs.length >= 2, `fundo 2+ segmentos: ${backSegs}`);
  const sumBack = backSegs.reduce((acc, idx) => {
    const row = segs.find((s) => s.segment_index === idx);
    return acc + Number(row?.distance ?? 0);
  }, 0);
  assert(
    near(m.fundo, sumBack),
    `fundo total ${m.fundo} != soma segmentos ${sumBack}`,
  );
  assert(
    (m.fundo ?? 0) > 20,
    `fundo agrupado deve superar um único segmento: ${m.fundo}`,
  );
  console.log('OK testBrokenBackTwoSegments');
}

/** 3. Lateral quebrada — lado direito com 2 segmentos colineares. */
function testBrokenRightSideTwoSegments() {
  const segs = [
    lineSeg(0, 40, 0, 40, 30, 30),
    lineSeg(1, 40, 30, 40, 20, 20),
    lineSeg(2, 40, 20, 40, 0, 20),
    lineSeg(3, 40, 0, 0, 0, 40),
    lineSeg(4, 0, 0, 0, 40, 40),
  ];
  const m = getOfficialLotMeasurements(
    block(segs, {
      front_segment_index: 0,
      front_street_name: 'RUA LAT',
      frente: 30,
    }),
    'LAT2',
  );
  const rightSegs = m.sides?.right.segmentIndexes ?? [];
  assert(rightSegs.length >= 2, `dir 2+ segmentos: ${rightSegs}`);
  const sumRight = rightSegs.reduce((acc, idx) => {
    const row = segs.find((s) => s.segment_index === idx);
    return acc + Number(row?.distance ?? 0);
  }, 0);
  assert(
    near(m.ladoDireito, sumRight),
    `dir ${m.ladoDireito} != soma ${sumRight}`,
  );
  assert(
    (m.ladoDireito ?? 0) > 40,
    `lateral agrupada deve superar um segmento: ${m.ladoDireito}`,
  );
  console.log('OK testBrokenRightSideTwoSegments');
}

/**
 * 4. Lote com 6 segmentos — totais agrupados consistentes com sides.*.
 */
function testSixSegmentsGroupedTotals() {
  const segs = [
    lineSeg(0, 0, 0, 0, 20, 20),
    lineSeg(1, 0, 20, 3, 23, 3),
    lineSeg(2, 3, 23, 3, 63, 40),
    lineSeg(3, 3, 63, 0, 63, 20),
    lineSeg(4, 0, 63, 0, 43, 20),
    lineSeg(5, 0, 43, 0, 0, 43),
  ];
  const m = getOfficialLotMeasurements(
    block(segs, {
      front_segment_index: 0,
      front_street_name: 'RUA INTERNA',
      frente: 20,
    }),
    'LOT6',
  );
  assert(m.segmentCount === 6, `6 segmentos: ${m.segmentCount}`);
  assert(near(m.frente, 20), `frente ${m.frente}`);
  for (const [key, field] of [
    ['back', 'fundo'],
    ['right', 'ladoDireito'],
    ['left', 'ladoEsquerdo'],
  ] as const) {
    const side = m.sides?.[key];
    const total = m[field];
    const sum = (side?.segmentIndexes ?? []).reduce((acc, idx) => {
      const row = segs.find((s) => s.segment_index === idx);
      return acc + Number(row?.distance ?? 0);
    }, 0);
    assert(near(total, sum), `${field} ${total} != soma ${sum}`);
    assert(near(side?.total ?? 0, sum), `sides.${key}.total inconsistente`);
  }
  assert(
    (m.sides?.back.segmentIndexes.length ?? 0) >= 2,
    `fundo multi-segmento: ${m.sides?.back.segmentIndexes}`,
  );
  console.log('OK testSixSegmentsGroupedTotals');
}

/** 5. Chanfre não entra na soma dos lados principais. */
function testChanfreExcludedFromSideTotals() {
  const segs = [
    lineSeg(0, 0, 0, 0, 20, 20),
    lineSeg(1, 0, 20, 3, 23, 3),
    lineSeg(2, 3, 23, 3, 63, 40),
    lineSeg(3, 3, 63, 0, 63, 3),
    lineSeg(4, 0, 63, 0, 0, 63),
  ];
  const m = getOfficialLotMeasurements(
    block(segs, {
      front_segment_index: 0,
      front_street_name: 'RUA CHAN',
      frente: 20,
    }),
    'CHAN',
  );
  const chanfreTotal = m.chanfre?.total ?? 0;
  assert(chanfreTotal > 0, 'chanfre detectado');
  assert(!near(m.fundo, 63 + chanfreTotal), 'fundo não inclui chanfre');
  assert(
    !(m.sides?.back.segmentIndexes ?? []).some((i) => i === 1),
    'chanfre seg 1 fora do fundo',
  );
  console.log('OK testChanfreExcludedFromSideTotals');
}

/** 6. Compatibilidade — campos legados frente/fundo/laterais preenchidos. */
function testLegacyFieldsCompatibility() {
  const segs = [
    lineSeg(0, 0, 0, 0, 25, 25),
    lineSeg(1, 0, 25, 50, 25, 50),
    lineSeg(2, 50, 25, 50, 0, 50),
    lineSeg(3, 50, 0, 0, 0, 50),
  ];
  const m: OfficialLotMeasures = getOfficialLotMeasurements(
    block(segs, { front_segment_index: 0 }),
    'LEG',
  );
  assert(m.frente != null, 'frente legado');
  assert(m.fundo != null, 'fundo legado');
  assert(m.ladoDireito != null, 'dir legado');
  assert(m.ladoEsquerdo != null, 'esq legado');
  assert(m.sides != null, 'sides presente');
  assert(m.frente === m.sides?.front.total, 'frente = sides.front.total');
  assert(m.fundo === m.sides?.back.total, 'fundo = sides.back.total');
  console.log('OK testLegacyFieldsCompatibility');
}

testRectangularSingleSegmentPerSide();
testBrokenBackTwoSegments();
testBrokenRightSideTwoSegments();
testSixSegmentsGroupedTotals();
testChanfreExcludedFromSideTotals();
testLegacyFieldsCompatibility();
console.log('mandatory-official-measurements-grouped-sides-tests: all passed');
