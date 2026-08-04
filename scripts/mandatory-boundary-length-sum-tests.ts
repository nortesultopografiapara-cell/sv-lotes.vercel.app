/**
 * Soma de medidas por confrontação (multi-segmento).
 * npx tsx scripts/mandatory-boundary-length-sum-tests.ts
 */
import {
  calculateBoundaryLength,
  getOfficialLotMeasurements,
  BOUNDARY_CHAIN_MAX_DEFLECTION_DEG,
} from '../lib/officialLotMeasurements';
import { resolveContractLotSides } from '../lib/contractLotBoundaries';
import { resolveLotMeasuresFromBlock } from '../lib/lotChanfre';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function near(a: number | null | undefined, b: number, tol = 0.08): boolean {
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
): Record<string, unknown> {
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
    number: 'T',
    area: 1000,
    front_segment_index: 0,
    front_street_name: 'RUA TESTE',
    segments_json: segments,
    ...extra,
  };
}

/** 1. Frente 1 seg + fundo 2 segs */
function testFront1Back2() {
  const segs = [
    lineSeg(0, 0, 0, 0, 34.49, 34.49),
    lineSeg(1, 0, 34.49, 40, 34.49, 40),
    lineSeg(2, 40, 34.49, 40, 18, 16.58),
    lineSeg(3, 40, 18, 40, 0, 18.0),
    lineSeg(4, 40, 0, 0, 0, 40),
  ];
  const m = getOfficialLotMeasurements(block(segs, { Frente: 34.49, Fundo: 16.58 }), 'F1B2');
  assert(near(m.frente, 34.49), `frente ${m.frente}`);
  assert(near(m.fundo, 16.58 + 18.0), `fundo soma ${m.fundo}`);
  assert((m.sides?.back.segmentIndexes?.length ?? 0) >= 2, 'fundo 2+ segs');
  assert(
    near(calculateBoundaryLength(block(segs), 'fundo'), 34.58),
    'calculateBoundaryLength fundo',
  );
  console.log('OK testFront1Back2');
}

/** 2. Frente 2 segs + fundo 1 seg */
function testFront2Back1() {
  const segs = [
    lineSeg(0, 0, 0, 0, 20, 20),
    lineSeg(1, 0, 20, 0, 34.49, 14.49),
    lineSeg(2, 0, 34.49, 40, 34.49, 40),
    lineSeg(3, 40, 34.49, 40, 0, 34.49),
    lineSeg(4, 40, 0, 0, 0, 40),
  ];
  const m = getOfficialLotMeasurements(block(segs), 'F2B1');
  assert(near(m.frente, 20 + 14.49), `frente soma ${m.frente}`);
  assert((m.sides?.front.segmentIndexes?.length ?? 0) >= 2, 'frente 2+ segs');
  assert(near(m.fundo, 34.49), `fundo ${m.fundo}`);
  console.log('OK testFront2Back1');
}

/** 3. Frente com 3 segmentos */
function testFront3() {
  const segs = [
    lineSeg(0, 0, 0, 0, 10, 10),
    lineSeg(1, 0, 10, 0, 20, 10),
    lineSeg(2, 0, 20, 0, 30, 10),
    lineSeg(3, 0, 30, 50, 30, 50),
    lineSeg(4, 50, 30, 50, 0, 30),
    lineSeg(5, 50, 0, 0, 0, 50),
  ];
  const m = getOfficialLotMeasurements(block(segs), 'F3');
  assert(near(m.frente, 30), `frente 3 segs ${m.frente}`);
  assert((m.sides?.front.segmentIndexes?.length ?? 0) >= 3, 'frente indexes');
  console.log('OK testFront3');
}

/** 4. Fundo com 3 segmentos */
function testBack3() {
  const segs = [
    lineSeg(0, 0, 0, 0, 30, 30),
    lineSeg(1, 0, 30, 50, 30, 50),
    lineSeg(2, 50, 30, 50, 20, 10),
    lineSeg(3, 50, 20, 50, 10, 10),
    lineSeg(4, 50, 10, 50, 0, 10),
    lineSeg(5, 50, 0, 0, 0, 50),
  ];
  const m = getOfficialLotMeasurements(block(segs), 'B3');
  assert(near(m.fundo, 30), `fundo 3 segs ${m.fundo}`);
  assert((m.sides?.back.segmentIndexes?.length ?? 0) >= 3, 'fundo indexes');
  console.log('OK testBack3');
}

/** 5. Lado direito com 2 segmentos */
function testRight2() {
  const segs = [
    lineSeg(0, 0, 0, 0, 30, 30),
    lineSeg(1, 0, 30, 20, 30, 20),
    lineSeg(2, 20, 30, 40, 30, 20),
    lineSeg(3, 40, 30, 40, 0, 30),
    lineSeg(4, 40, 0, 0, 0, 40),
  ];
  const m = getOfficialLotMeasurements(block(segs), 'R2');
  assert((m.sides?.right.segmentIndexes?.length ?? 0) >= 2, `dir segs ${m.sides?.right.segmentIndexes}`);
  const sum = (m.sides?.right.segmentIndexes ?? []).reduce((acc, idx) => {
    const row = segs.find((s) => s.segment_index === idx);
    return acc + Number(row?.distance ?? 0);
  }, 0);
  assert(near(m.ladoDireito, sum), `dir ${m.ladoDireito} != ${sum}`);
  console.log('OK testRight2');
}

/** 6. Lado esquerdo com 2 segmentos */
function testLeft2() {
  const segs = [
    lineSeg(0, 0, 0, 0, 30, 30),
    lineSeg(1, 0, 30, 40, 30, 40),
    lineSeg(2, 40, 30, 40, 0, 30),
    lineSeg(3, 40, 0, 20, 0, 20),
    lineSeg(4, 20, 0, 0, 0, 20),
  ];
  const m = getOfficialLotMeasurements(block(segs), 'L2');
  assert((m.sides?.left.segmentIndexes?.length ?? 0) >= 2, `esq segs ${m.sides?.left.segmentIndexes}`);
  const sum = (m.sides?.left.segmentIndexes ?? []).reduce((acc, idx) => {
    const row = segs.find((s) => s.segment_index === idx);
    return acc + Number(row?.distance ?? 0);
  }, 0);
  assert(near(m.ladoEsquerdo, sum), `esq ${m.ladoEsquerdo} != ${sum}`);
  console.log('OK testLeft2');
}

/** 7. Lote regular 4 segmentos */
function testRegular4() {
  const segs = [
    lineSeg(0, 0, 0, 0, 25, 25),
    lineSeg(1, 0, 25, 50, 25, 50),
    lineSeg(2, 50, 25, 50, 0, 25),
    lineSeg(3, 50, 0, 0, 0, 50),
  ];
  const m = getOfficialLotMeasurements(block(segs), 'REG4');
  assert(near(m.frente, 25), `frente ${m.frente}`);
  assert(near(m.fundo, 25), `fundo ${m.fundo}`);
  assert(near(m.ladoDireito, 50), `dir ${m.ladoDireito}`);
  assert(near(m.ladoEsquerdo, 50), `esq ${m.ladoEsquerdo}`);
  console.log('OK testRegular4');
}

/** 8. Irregular com pequeno ângulo entre segmentos do fundo (~20°) */
function testSmallAngleBack() {
  const segs = [
    lineSeg(0, 0, 0, 0, 34.49, 34.49),
    lineSeg(1, 0, 34.49, 40, 34.49, 40),
    lineSeg(2, 40, 34.49, 42, 18, 16.58),
    lineSeg(3, 42, 18, 40, 0, 18.11),
    lineSeg(4, 40, 0, 0, 0, 40),
  ];
  const m = getOfficialLotMeasurements(block(segs, { Fundo: 16.58 }), 'ANG');
  assert(near(m.fundo, 16.58 + 18.11), `fundo ângulo ${m.fundo}`);
  assert(
    BOUNDARY_CHAIN_MAX_DEFLECTION_DEG === 45,
    'tolerância angular documentada 45°',
  );
  console.log('OK testSmallAngleBack');
}

/** 9. Segmentos fora de ordem no array */
function testOutOfOrderArray() {
  const segs = [
    lineSeg(2, 40, 34.49, 40, 18, 16.58),
    lineSeg(0, 0, 0, 0, 34.49, 34.49),
    lineSeg(4, 40, 0, 0, 0, 40),
    lineSeg(1, 0, 34.49, 40, 34.49, 40),
    lineSeg(3, 40, 18, 40, 0, 18.0),
  ];
  const m = getOfficialLotMeasurements(block(segs), 'OOO');
  assert(near(m.frente, 34.49), `frente ${m.frente}`);
  assert(near(m.fundo, 34.58), `fundo ${m.fundo}`);
  console.log('OK testOutOfOrderArray');
}

/** 10. Nenhum segmento para confrontação → 0 / null seguro */
function testEmptyBoundary() {
  const len = calculateBoundaryLength({}, 'fundo');
  assert(len === 0, `vazio deve ser 0, got ${len}`);
  assert(!Number.isNaN(len), 'não NaN');
  console.log('OK testEmptyBoundary');
}

/** 11. Decimais: soma sem arredondamento intermediário no total */
function testDecimalPrecision() {
  const segs = [
    lineSeg(0, 0, 0, 0, 10.111, 10.111),
    lineSeg(1, 0, 10.111, 20.222, 10.111, 20.222),
    lineSeg(2, 20.222, 10.111, 20.222, 0, 10.111),
    lineSeg(3, 20.222, 0, 20.222, -5.333, 5.333),
    lineSeg(4, 20.222, -5.333, 0, 0, 20.333),
  ];
  const b = block(segs);
  const m = getOfficialLotMeasurements(b, 'DEC');
  const backIdx = m.sides?.back.segmentIndexes ?? [];
  assert(backIdx.length >= 2, 'fundo multi para testar soma');
  // Soma dos distances já parseados (fonte usada no cálculo) — sem round2 no reduce.
  const parsedDistances = backIdx.map((idx) => {
    const row = segs.find((s) => Number(s.segment_index) === idx);
    return Number(row?.distance ?? 0);
  });
  const sumInput = parsedDistances.reduce((a, b) => a + b, 0);
  // O total oficial deve ser a soma completa dos segmentos do lado (não só o 1º).
  assert(m.fundo != null && m.fundo > Math.max(...parsedDistances) + 0.01, 'soma > maior segmento');
  assert(
    Math.abs(Number(m.fundo) - Number(calculateBoundaryLength(b, 'FUNDO'))) < 1e-9,
    'calculateBoundaryLength === getOfficialLotMeasurements',
  );
  // Aceita parse round2 por segmento, mas o total não aplica round2 extra além da soma.
  const sumRoundedInputs = parsedDistances
    .map((d) => Math.round(d * 100) / 100)
    .reduce((a, b) => a + b, 0);
  assert(
    Math.abs(Number(m.fundo) - sumRoundedInputs) < 1e-9 ||
      Math.abs(Number(m.fundo) - sumInput) < 1e-9,
    `total deve ser soma dos segmentos: ${m.fundo} vs ${sumInput}/${sumRoundedInputs}`,
  );
  console.log('OK testDecimalPrecision');
}

/** 12. Modal (resolveLotMeasures) === contrato (resolveContractLotSides) */
function testModalEqualsContract() {
  const segs = [
    lineSeg(0, 0, 0, 0, 34.49, 34.49),
    lineSeg(1, 0, 34.49, 40, 34.49, 40),
    lineSeg(2, 40, 34.49, 40, 18, 16.58),
    lineSeg(3, 40, 18, 40, 0, 18.0),
    lineSeg(4, 40, 0, 0, 0, 40),
  ];
  const b = block(segs, { Fundo: '16.58', number: '3' });
  const modal = resolveLotMeasuresFromBlock(b);
  const contract = resolveContractLotSides(b);
  assert(near(modal.sides.fundo, Number(contract.fundo)), 'modal==contrato fundo');
  assert(near(modal.sides.frente, Number(contract.frente)), 'modal==contrato frente');
  assert(
    near(modal.sides.fundo, 34.58),
    `ambos devem somar fundo, got modal=${modal.sides.fundo} contract=${contract.fundo}`,
  );
  console.log('OK testModalEqualsContract');
}

/** 13. Preserva lote com 1 segmento por lado */
function testPreserveSinglePerSide() {
  const segs = [
    lineSeg(0, 0, 0, 0, 25, 25),
    lineSeg(1, 0, 25, 50, 25, 50),
    lineSeg(2, 50, 25, 50, 0, 25),
    lineSeg(3, 50, 0, 0, 0, 50),
  ];
  const m = getOfficialLotMeasurements(block(segs), '1PS');
  assert(near(m.frente, 25) && near(m.fundo, 25), '1 seg frente/fundo');
  assert(near(m.ladoDireito, 50) && near(m.ladoEsquerdo, 50), '1 seg laterais');
  assert((m.sides?.front.segmentIndexes ?? []).length === 1, 'front 1');
  assert((m.sides?.back.segmentIndexes ?? []).length === 1, 'back 1');
  console.log('OK testPreserveSinglePerSide');
}

/** Lote 3 / QD 06 — cenário reportado (frente 34,49; fundo 16,58+segundo) */
function testLote3Qd06Scenario() {
  const segs = [
    lineSeg(0, 7500000, 500000, 7500000, 500034.49, 34.49),
    lineSeg(1, 7500000, 500034.49, 7500030, 500034.49, 30),
    lineSeg(2, 7500030, 500034.49, 7500030, 500017.91, 16.58),
    lineSeg(3, 7500030, 500017.91, 7500028, 500000, 18.02),
    lineSeg(4, 7500028, 500000, 7500000, 500000, 28),
  ];
  const b = block(segs, {
    number: '3',
    block_name: 'QD 06',
    Fundo: '16.58',
    frente: 34.49,
  });
  const m = getOfficialLotMeasurements(b, '3');
  const backIdx = m.sides?.back.segmentIndexes ?? [];
  const parts = backIdx.map((idx) => {
    const row = segs.find((s) => s.segment_index === idx);
    return { idx, distance: Number(row?.distance ?? 0) };
  });
  const sum = parts.reduce((a, p) => a + p.distance, 0);
  console.log('LOTE3_QD06_FUNDO_PARTS', JSON.stringify(parts));
  console.log('LOTE3_QD06_FUNDO_SUM', sum, 'computed', m.fundo);
  assert(parts.length >= 2, `fundo deve ter 2+ segmentos: ${JSON.stringify(parts)}`);
  assert(near(m.fundo, sum), `soma ${m.fundo} != ${sum}`);
  assert(near(m.fundo, 16.58 + 18.02), `esperado 34,60 got ${m.fundo}`);
  assert(m.fundo !== 16.58, 'não pode ficar só no 1º segmento 16,58');
  console.log('OK testLote3Qd06Scenario');
}

/**
 * Fundo com 2 segmentos + chanfre curto adjacente (1–5 m / ~45°).
 * Soma só os 2 do fundo; chanfre fora da confrontação.
 */
function testTwoSegmentBackWithAdjacentChanfre() {
  // Frente 30; dir 40; chanfre canto fundo 3 m; fundo 16,58+18,02; esq 40
  const segs = [
    lineSeg(0, 7500000, 500000, 7500000, 500030, 30),
    lineSeg(1, 7500000, 500030, 7500040, 500030, 40),
    lineSeg(2, 7500040, 500030, 7500042.12, 500027.88, 3), // chanfre ~45°
    lineSeg(3, 7500042.12, 500027.88, 7500042.12, 500011.3, 16.58),
    lineSeg(4, 7500042.12, 500011.3, 7500040, 500000, 18.02),
    lineSeg(5, 7500040, 500000, 7500000, 500000, 40),
  ];
  const m = getOfficialLotMeasurements(
    block(segs, {
      front_segment_index: 0,
      front_street_name: 'RUA CHANFRE',
      frente: 30,
    }),
    'BACK2+CHAN',
  );
  const backIdx = m.sides?.back.segmentIndexes ?? [];
  assert(!backIdx.includes(2), `chanfre idx 2 não pode estar no fundo: ${backIdx}`);
  assert(backIdx.includes(3) && backIdx.includes(4), `fundo 3+4: ${backIdx}`);
  assert(near(m.fundo, 16.58 + 18.02), `fundo sem chanfre: ${m.fundo}`);
  const chanfre = m.chanfre?.total ?? 0;
  assert(chanfre > 0, 'chanfre detectado');
  assert(!near(m.fundo, 16.58 + 18.02 + 3), 'fundo não soma chanfre 3 m');
  console.log('OK testTwoSegmentBackWithAdjacentChanfre');
}

/** segments_json: array | string | null | vazio | inválido — sem throw */
function testSegmentsJsonSafePaths() {
  const segs = [
    lineSeg(0, 0, 0, 0, 25, 25),
    lineSeg(1, 0, 25, 50, 25, 50),
    lineSeg(2, 50, 25, 50, 0, 25),
    lineSeg(3, 50, 0, 0, 0, 50),
  ];

  const asArray = getOfficialLotMeasurements(block(segs), 'JSON-ARR');
  assert(near(asArray.frente, 25), 'array ok');

  const asString = getOfficialLotMeasurements(
    block([], {
      segments_json: JSON.stringify(segs),
      front_segment_index: 0,
      front_street_name: 'RUA',
    }),
    'JSON-STR',
  );
  assert(near(asString.frente, 25), 'string JSON ok');
  assert(near(asString.fundo, asArray.fundo!), 'string==array');

  for (const [label, raw] of [
    ['null', null],
    ['empty-arr', []],
    ['empty-str', ''],
    ['invalid', '{not-json'],
    ['object', { foo: 1 }],
  ] as const) {
    let threw = false;
    let m;
    try {
      m = getOfficialLotMeasurements(
        {
          number: label,
          frente: 12,
          Fundo: 13,
          'Lado Dir.': 14,
          'Lado Esq.': 15,
          segments_json: raw as unknown,
        },
        label,
      );
      resolveLotMeasuresFromBlock({
        number: label,
        frente: 12,
        Fundo: 13,
        segments_json: raw as unknown,
      });
      resolveContractLotSides({
        number: label,
        frente: 12,
        Fundo: 13,
        segments_json: raw as unknown,
      });
      calculateBoundaryLength(
        { frente: 12, Fundo: 13, segments_json: raw as unknown },
        'fundo',
      );
    } catch {
      threw = true;
    }
    assert(!threw, `não deve lançar para segments_json=${label}`);
    assert(m != null, `retorna medidas para ${label}`);
  }

  const contractNull = resolveContractLotSides({
    segments_json: '{broken',
    Fundo: '16.58',
    frente: 34.49,
  });
  assert(contractNull.fundo != null || contractNull.frente != null, 'fallback colunas');
  console.log('OK testSegmentsJsonSafePaths');
}

function main() {
  testFront1Back2();
  testFront2Back1();
  testFront3();
  testBack3();
  testRight2();
  testLeft2();
  testRegular4();
  testSmallAngleBack();
  testOutOfOrderArray();
  testEmptyBoundary();
  testDecimalPrecision();
  testModalEqualsContract();
  testPreserveSinglePerSide();
  testLote3Qd06Scenario();
  testTwoSegmentBackWithAdjacentChanfre();
  testSegmentsJsonSafePaths();
  console.log('mandatory-boundary-length-sum-tests: all passed');
}

main();
