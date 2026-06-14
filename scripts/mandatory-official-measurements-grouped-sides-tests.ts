/**
 * ETAPA 2.1 — medidas oficiais agrupadas por lado (segments_json TXT).
 * npx tsx scripts/mandatory-official-measurements-grouped-sides-tests.ts
 */

import {
  getOfficialLotMeasurements,
  stripManualOfficialSidesFromBlock,
  type OfficialLotMeasures,
} from '../lib/officialLotMeasurements';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function near(a: number | null | undefined, b: number, tol = 0.06): boolean {
  return a != null && Number.isFinite(a) && Math.abs(a - b) <= tol;
}

function assertDisjointSideIndexes(m: OfficialLotMeasures) {
  const sides = m.sides;
  assert(sides != null, 'sides ausente');
  const seen = new Map<number, string>();
  for (const [name, side] of Object.entries(sides) as [
    string,
    { segmentIndexes: number[] },
  ][]) {
    for (const idx of side.segmentIndexes) {
      const prev = seen.get(idx);
      assert(
        prev == null,
        `segmento ${idx} em ${prev} e ${name}`,
      );
      seen.set(idx, name);
    }
  }
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

/**
 * Lote 010 / QD 02 — planta Civil (6 segmentos com official_side manual).
 * Frente 30,62 | Fundo 31,85 | Esq. 87,25 | Dir. 60,74+7,26+28,54 = 96,54
 */
function testLot010OfficialSidesFromSixSegments() {
  const segs = [
    lineSeg(0, 7500000, 500000, 7500000, 500030.62, 30.62, 'front'),
    lineSeg(1, 7500000, 500030.62, 7500087.25, 500030.62, 87.25, 'left'),
    lineSeg(2, 7500087.25, 500030.62, 7500087.25, 500062.47, 31.85, 'back'),
    lineSeg(3, 7500087.25, 500062.47, 7500026.73, 500062.47, 60.74, 'right'),
    lineSeg(4, 7500026.73, 500062.47, 7500020.6, 500056.34, 7.26, 'right'),
    lineSeg(5, 7500020.6, 500056.34, 7500000, 500030.62, 28.54, 'right'),
  ];
  const m = getOfficialLotMeasurements(
    block(segs, {
      number: '010',
      front_segment_index: 0,
      front_street_name: 'RUA CENTRAL',
      frente: 30.62,
      area: 2727.13,
    }),
    '010',
  );

  assert(near(m.frente, 30.62), `frente ${m.frente}`);
  assert(near(m.fundo, 31.85), `fundo ${m.fundo}`);
  assert(near(m.ladoEsquerdo, 87.25), `esq ${m.ladoEsquerdo}`);
  assert(near(m.ladoDireito, 96.54), `dir ${m.ladoDireito}`);
  assert(!near(m.ladoEsquerdo, 99.62), `esq não pode ser 99,62: ${m.ladoEsquerdo}`);
  assert(!near(m.fundo, 19.48), `fundo não pode ser só 19,48: ${m.fundo}`);

  const backIdx = new Set(m.sides?.back.segmentIndexes ?? []);
  for (const idx of m.sides?.left.segmentIndexes ?? []) {
    assert(!backIdx.has(idx), `esq seg ${idx} não pode estar no fundo`);
  }
  for (const idx of m.sides?.right.segmentIndexes ?? []) {
    assert(!backIdx.has(idx), `dir seg ${idx} não pode estar no fundo`);
  }
  assertDisjointSideIndexes(m);
  assert((m.sides?.back.segmentIndexes.length ?? 0) >= 1, 'fundo com segmentos');
  assert((m.sides?.right.segmentIndexes.length ?? 0) === 3, 'dir 3 segmentos');
  console.log('OK testLot010OfficialSidesFromSixSegments');
}

/** Lote 010 — fundo quebrado 19,48+12,37 sem official_side (reclaim automático). */
function testLot010AutoFundoBreakFromSevenSegments() {
  const segs = [
    lineSeg(0, 7500000, 500000, 7500000, 500030.62, 30.62),
    lineSeg(1, 7500000, 500030.62, 7500060.74, 500030.62, 60.74),
    lineSeg(2, 7500060.74, 500030.62, 7500065.87, 500035.75, 7.26),
    lineSeg(3, 7500065.87, 500035.75, 7500087.25, 500057.13, 28.54),
    lineSeg(4, 7500087.25, 500057.13, 7500087.25, 500037.65, 19.48),
    lineSeg(5, 7500087.25, 500037.65, 7500087.25, 500030.62, 12.37),
    lineSeg(6, 7500087.25, 500030.62, 7500000, 500030.62, 87.25),
  ];
  const m = getOfficialLotMeasurements(
    block(segs, {
      number: '010',
      front_segment_index: 0,
      front_street_name: 'RUA CENTRAL',
      frente: 30.62,
      area: 2727.13,
    }),
    '010-AUTO',
  );

  assert(near(m.frente, 30.62), `frente ${m.frente}`);
  assert(near(m.fundo, 31.85), `fundo auto ${m.fundo}`);
  assert(near(m.ladoEsquerdo, 87.25), `esq auto ${m.ladoEsquerdo}`);
  assert(!near(m.ladoEsquerdo, 99.62), `esq auto não 99,62: ${m.ladoEsquerdo}`);
  assertDisjointSideIndexes(m);
  console.log('OK testLot010AutoFundoBreakFromSevenSegments');
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

/** QD 01 LT 15 — fundo colinear 7,46+17,13=24,59 (seg. 3+4 no TXT). */
function testQd01Lt15ColinearBackGroup() {
  const segs = [
    lineSeg(0, 0, 0, 0, 24.37, 24.37),
    lineSeg(1, 0, 24.37, 35, 24.37, 35),
    lineSeg(3, 35, 24.37, 35, 17.91, 7.46),
    lineSeg(4, 35, 17.91, 35, 0.78, 17.13),
    lineSeg(5, 35, 0.78, 0, 0, 35.01),
  ];
  const m = getOfficialLotMeasurements(
    block(segs, {
      number: '15',
      front_segment_index: 0,
      front_street_name: 'RUA PRINCIPAL',
      frente: 24.37,
      area: 850,
    }),
    'QD01-LT15',
  );

  assert(near(m.frente, 24.37), `frente ${m.frente}`);
  assert(near(m.fundo, 24.59), `fundo 7,46+17,13 m: ${m.fundo}`);
  assert(near(m.ladoDireito, 35), `dir ${m.ladoDireito}`);
  assert(near(m.ladoEsquerdo, 35.01), `esq ${m.ladoEsquerdo}`);
  const backSegs = m.sides?.back.segmentIndexes ?? [];
  assert(
    backSegs.length >= 2,
    `fundo deve agrupar 2+ segmentos colineares: ${backSegs}`,
  );
  assertDisjointSideIndexes(m);
  console.log('OK testQd01Lt15ColinearBackGroup');
}

/** 2. Fundo com conector chanfre — agrupa trecho principal + conector (Lote 010-like). */
function testBrokenBackTwoSegments() {
  const segs = [
    lineSeg(0, 7500000, 500000, 7500000, 500030.62, 30.62),
    lineSeg(1, 7500000, 500030.62, 7500089.28, 500030.62, 89.28),
    lineSeg(2, 7500089.28, 500030.62, 7500089.28, 500011.14, 19.48),
    lineSeg(3, 7500089.28, 500011.14, 7500077.13, 500000, 12.37),
    lineSeg(4, 7500077.13, 500000, 7500012.75, 500000, 64.38),
    lineSeg(5, 7500012.75, 500000, 7500000, 500000, 12.75),
  ];
  const m = getOfficialLotMeasurements(
    block(segs, {
      front_segment_index: 0,
      front_street_name: 'RUA FUNDO',
      frente: 30.62,
    }),
    'BACK2',
  );
  const backSegs = m.sides?.back.segmentIndexes ?? [];
  const sumBack = backSegs.reduce((acc, idx) => {
    const row = segs.find((s) => s.segment_index === idx);
    return acc + Number(row?.distance ?? 0);
  }, 0);
  assert(
    near(m.fundo, sumBack),
    `fundo total ${m.fundo} != soma segmentos ${sumBack}`,
  );
  assert(near(m.fundo, 31.85), `fundo 19,48+12,37 m: ${m.fundo}`);
  assert(
    backSegs.length >= 2,
    `fundo deve agrupar 2+ segmentos: ${backSegs}`,
  );
  assertDisjointSideIndexes(m);
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
    (m.ladoDireito ?? 0) >= 40,
    `lateral agrupada deve incluir 2 segmentos: ${m.ladoDireito}`,
  );
  assertDisjointSideIndexes(m);
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
  assertDisjointSideIndexes(m);
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

/**
 * 7. Lote 010 / QD 02 — lateral esquerda não soma fundo (119,10 = 87,25 + 31,85).
 * Geometria 6 segmentos: frente 30,62; fundo 19,48+12,37; dir 89,28; esq ~77,13 sem fundo.
 */
function testLot010DoesNotOverSumLeftSide() {
  const segs = [
    lineSeg(0, 7500000, 500000, 7500000, 500030.62, 30.62),
    lineSeg(1, 7500000, 500030.62, 7500089.28, 500030.62, 89.28),
    lineSeg(2, 7500089.28, 500030.62, 7500089.28, 500011.14, 19.48),
    lineSeg(3, 7500089.28, 500011.14, 7500077.13, 500000, 12.37),
    lineSeg(4, 7500077.13, 500000, 7500012.75, 500000, 64.38),
    lineSeg(5, 7500012.75, 500000, 7500000, 500000, 12.75),
  ];
  const m = getOfficialLotMeasurements(
    block(segs, {
      number: '010',
      front_segment_index: 0,
      front_street_name: 'RUA QD02',
      frente: 30.62,
      area: 2727.13,
    }),
    '010',
  );

  assert(near(m.frente, 30.62), `frente ${m.frente}`);
  assert(near(m.fundo, 31.85), `fundo ${m.fundo}`);
  assert(near(m.ladoDireito, 89.28), `dir ${m.ladoDireito}`);

  const backIdx = new Set(m.sides?.back.segmentIndexes ?? []);
  const leftIdx = m.sides?.left.segmentIndexes ?? [];
  const leftSum = leftIdx.reduce((acc, idx) => {
    const row = segs.find((s) => s.segment_index === idx);
    return acc + Number(row?.distance ?? 0);
  }, 0);

  assert(
    !leftIdx.some((idx) => backIdx.has(idx)),
    `lado esq inclui segmento do fundo: left=${leftIdx} back=${[...backIdx]}`,
  );
  assertDisjointSideIndexes(m);
  assert(
    !near(m.ladoEsquerdo, 119.1),
    `lado esq não pode ser 119,10 (fundo+lat): ${m.ladoEsquerdo}`,
  );
  assert(
    (m.ladoEsquerdo ?? 0) < 100,
    `lado esq excessivo: ${m.ladoEsquerdo}`,
  );
  assert(near(m.ladoEsquerdo, leftSum), `esq ${m.ladoEsquerdo} != soma ${leftSum}`);
  assert(
    near(m.ladoEsquerdo, 77.13, 0.15),
    `esq esperado ~77,13 (64,38+12,75): ${m.ladoEsquerdo}`,
  );

  console.log('OK testLot010DoesNotOverSumLeftSide');
}

/** ETAPA 2.1.3 — official_side manual vence heurística. */
function testManualOfficialSideOverridesHeuristic() {
  const segs = [
    lineSeg(0, 0, 0, 0, 50, 50),
    lineSeg(1, 0, 50, 100, 50, 100),
    lineSeg(2, 100, 50, 100, 0, 50),
    lineSeg(3, 100, 0, 0, 0, 100),
  ];
  const auto = getOfficialLotMeasurements(
    block(segs, { front_segment_index: 0, frente: 50 }),
    'OVERRIDE-AUTO',
  );
  const autoBack = new Set(auto.sides?.back.segmentIndexes ?? []);
  const targetIdx = [...autoBack][0];
  assert(targetIdx != null, 'segmento de fundo automático');

  const manualSegs = segs.map((s) =>
    s.segment_index === targetIdx
      ? { ...s, official_side: 'right' }
      : s,
  );
  const manual = getOfficialLotMeasurements(
    block(manualSegs, { front_segment_index: 0, frente: 50 }),
    'OVERRIDE-MANUAL',
  );
  assert(
    (manual.sides?.right.segmentIndexes ?? []).includes(targetIdx),
    `seg ${targetIdx} deve estar no lado direito manual`,
  );
  assert(
    !(manual.sides?.back.segmentIndexes ?? []).includes(targetIdx),
    `seg ${targetIdx} não pode permanecer no fundo`,
  );
  assertDisjointSideIndexes(manual);
  console.log('OK testManualOfficialSideOverridesHeuristic');
}

/** ETAPA 2.1.3 — limpar official_side volta ao automático. */
function testClearOfficialSideReturnsToAutomatic() {
  const segs = [
    lineSeg(0, 0, 0, 0, 50, 50, 'front'),
    lineSeg(1, 0, 50, 100, 50, 100, 'left'),
    lineSeg(2, 100, 50, 100, 0, 50, 'back'),
    lineSeg(3, 100, 0, 0, 0, 100, 'right'),
  ];
  const withManual = getOfficialLotMeasurements(
    block(segs, { front_segment_index: 0 }),
    'CLEAR-MANUAL',
  );
  const cleared = getOfficialLotMeasurements(
    stripManualOfficialSidesFromBlock(
      block(segs, { front_segment_index: 0 }),
    ),
    'CLEAR-AUTO',
  );
  const plain = getOfficialLotMeasurements(
    block(
      segs.map(({ official_side: _o, ...rest }) => rest),
      { front_segment_index: 0 },
    ),
    'CLEAR-PLAIN',
  );
  assert(near(withManual.fundo, 50), `manual fundo ${withManual.fundo}`);
  assert(near(cleared.fundo, plain.fundo), `cleared fundo ${cleared.fundo}`);
  assert(near(cleared.ladoDireito, plain.ladoDireito), 'cleared dir');
  assertDisjointSideIndexes(cleared);
  console.log('OK testClearOfficialSideReturnsToAutomatic');
}

/**
 * ETAPA 2.1.3 — Lote 010: só o conector 7,26 m como right → dir 96,54 m.
 */
function testLot010Single726SegmentManualRight() {
  const segs = [
    lineSeg(0, 7500000, 500000, 7500000, 500030.62, 30.62),
    lineSeg(1, 7500000, 500030.62, 7500060.74, 500030.62, 60.74),
    lineSeg(2, 7500060.74, 500030.62, 7500065.87, 500035.75, 7.26, 'right'),
    lineSeg(3, 7500065.87, 500035.75, 7500087.25, 500057.13, 28.54),
    lineSeg(4, 7500087.25, 500057.13, 7500087.25, 500037.65, 19.48),
    lineSeg(5, 7500087.25, 500037.65, 7500087.25, 500030.62, 12.37),
    lineSeg(6, 7500087.25, 500030.62, 7500000, 500030.62, 87.25),
  ];
  const m = getOfficialLotMeasurements(
    block(segs, {
      number: '010',
      front_segment_index: 0,
      front_street_name: 'RUA CENTRAL',
      frente: 30.62,
      area: 2727.13,
    }),
    '010-726-RIGHT',
  );
  assert(near(m.ladoDireito, 96.54), `dir ${m.ladoDireito} esperado 96,54`);
  assert(near(m.fundo, 31.85), `fundo ${m.fundo}`);
  assert(near(m.ladoEsquerdo, 87.25), `esq ${m.ladoEsquerdo}`);
  assert(
    (m.sides?.right.segmentIndexes ?? []).includes(2),
    'seg 7,26 m (idx 2) no lado direito',
  );
  assertDisjointSideIndexes(m);
  console.log('OK testLot010Single726SegmentManualRight');
}

/** ETAPA 2.1.3 — popup/medidas sem official_side não quebra. */
function testMeasuresWithoutOfficialSideSafe() {
  const segs = [
    lineSeg(0, 0, 0, 0, 25, 25),
    lineSeg(1, 0, 25, 50, 25, 50),
    lineSeg(2, 50, 25, 50, 0, 50),
    lineSeg(3, 50, 0, 0, 0, 50),
  ];
  let threw = false;
  let m: OfficialLotMeasures | null = null;
  try {
    m = getOfficialLotMeasurements(
      block(segs, { front_segment_index: 0 }),
      'NO-OFFICIAL',
    );
  } catch {
    threw = true;
  }
  assert(!threw, 'getOfficialLotMeasurements não deve lançar');
  assert(m != null, 'medidas retornadas');
  assert(m!.frente != null, 'frente preenchida');
  assert(m!.sides != null, 'sides presente');
  assertDisjointSideIndexes(m!);
  console.log('OK testMeasuresWithoutOfficialSideSafe');
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
testQd01Lt15ColinearBackGroup();
testBrokenBackTwoSegments();
testBrokenRightSideTwoSegments();
testSixSegmentsGroupedTotals();
testChanfreExcludedFromSideTotals();
testLegacyFieldsCompatibility();
testLot010DoesNotOverSumLeftSide();
testLot010OfficialSidesFromSixSegments();
testLot010AutoFundoBreakFromSevenSegments();
testManualOfficialSideOverridesHeuristic();
testClearOfficialSideReturnsToAutomatic();
testLot010Single726SegmentManualRight();
testMeasuresWithoutOfficialSideSafe();
console.log('mandatory-official-measurements-grouped-sides-tests: all passed');
