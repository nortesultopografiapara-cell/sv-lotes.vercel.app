/**
 * Fixtures sanitizadas — geometria estilo Meneses QD 06 (chácaras longas).
 *
 * Demonstra o bug de produção:
 * - frente/fundo multi-segmento com kink 30°–45°
 * - laterais longas (~247 m)
 * - trecho de extremidade NÃO pode ser absorvido pela lateral
 *
 * npx tsx scripts/mandatory-meneses-qd06-boundary-tests.ts
 */
import {
  getOfficialLotMeasurements,
  expandChainByConsecutiveDeflection,
  parseOfficialSegmentsFromBlock,
  BOUNDARY_CHAIN_MAX_DEFLECTION_DEG,
} from '../lib/officialLotMeasurements';
import {
  resolveLotMeasuresFromBlock,
  parseSegmentLengthsFromJson,
  parsePositiveSegmentLength,
} from '../lib/lotChanfre';
import { resolveContractLotSides } from '../lib/contractLotBoundaries';
import { findPropagationTargets } from '../lib/assistedConfrontation';
import { loadLotConfrontations } from '../lib/lotConfrontationsPanel';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function near(a: number | null | undefined, b: number, tol = 0.15): boolean {
  return a != null && Number.isFinite(a) && Math.abs(Number(a) - b) <= tol;
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
    segment_type: 'LINE' as const,
  };
}

function block(
  segs: ReturnType<typeof lineSeg>[],
  extra: Record<string, unknown> = {},
) {
  return {
    number: extra.number ?? '4',
    block_name: 'QD 06',
    source_import: 'TXT_CIVIL3D',
    front_segment_index: extra.front_segment_index ?? 1,
    front_street_name: 'RUA 05',
    segments_json: segs,
    ...extra,
  };
}

function assertDisjointSides(
  m: ReturnType<typeof getOfficialLotMeasurements>,
  label: string,
) {
  const f = m.sides?.front.segmentIndexes ?? [];
  const b = m.sides?.back.segmentIndexes ?? [];
  const r = m.sides?.right.segmentIndexes ?? [];
  const l = m.sides?.left.segmentIndexes ?? [];
  const all = [...f, ...b, ...r, ...l];
  assert(new Set(all).size === all.length, `${label}: índices compartilhados ${JSON.stringify({ f, b, r, l })}`);
}

/**
 * Lote 4 estilo — frente 13,10 + 18,48 + 29,33 ≈ 60,91
 * kink ~35° entre 1º e 2º (quebra agrupamento ≤30° antigo).
 * Fundo 18,46 + 28,83 + 16,60 ≈ 63,89
 * Laterais ~247 m
 */
function buildLote4StyleSegments() {
  const f0 = 13.1;
  const f1 = 18.48;
  const f2 = 29.33;
  const back0 = 18.46;
  const back1 = 28.83;
  const back2 = 16.6;
  const right = 247.2;
  const left = 246.68;

  const angRad = (35 * Math.PI) / 180;
  const f0e = f0 * Math.cos(angRad);
  const f0n = f0 * Math.sin(angRad);

  let n = 0;
  let e = 0;
  const s0 = lineSeg(0, n, e, n + f0n, e + f0e, f0);
  n = s0.end_north;
  e = s0.end_east;
  const s1 = lineSeg(1, n, e, n, e + f1, f1);
  n = s1.end_north;
  e = s1.end_east;
  const s2 = lineSeg(2, n, e, n, e + f2, f2);
  n = s2.end_north;
  e = s2.end_east;

  const s3 = lineSeg(3, n, e, n + right, e, right);
  n = s3.end_north;
  e = s3.end_east;

  const bAng = (32 * Math.PI) / 180;
  const b0e = -(back0 * Math.cos(bAng));
  const b0n = back0 * Math.sin(bAng);
  const s4 = lineSeg(4, n, e, n + b0n, e + b0e, back0);
  n = s4.end_north;
  e = s4.end_east;
  const s5 = lineSeg(5, n, e, n, e - back1, back1);
  n = s5.end_north;
  e = s5.end_east;
  const s6 = lineSeg(
    6,
    n,
    e,
    n - back2 * Math.sin(bAng),
    e - back2 * Math.cos(bAng),
    back2,
  );
  n = s6.end_north;
  e = s6.end_east;

  const s7 = lineSeg(7, n, e, 0, 0, left);

  return {
    segs: [s0, s1, s2, s3, s4, s5, s6, s7],
    expected: {
      frente: f0 + f1 + f2,
      fundo: back0 + back1 + back2,
      right,
      left,
      persistedBugFrente: 47.71,
      persistedBugEsq: 258.21,
    },
  };
}

/** Lote 3 estilo — fundo 16,58 + 18,02; laterais longas. */
function buildLote3StyleSegments() {
  const frente = 34.49;
  const dir = 245.31;
  const fundoA = 16.58;
  const fundoB = 18.02;
  const esq = 258.23;

  const ang = (33 * Math.PI) / 180;
  let n = 0;
  let e = 0;
  const s0 = lineSeg(0, n, e, n, e + frente, frente);
  n = s0.end_north;
  e = s0.end_east;
  const s1 = lineSeg(1, n, e, n + dir, e, dir);
  n = s1.end_north;
  e = s1.end_east;
  const s2 = lineSeg(
    2,
    n,
    e,
    n + fundoA * Math.sin(ang),
    e - fundoA * Math.cos(ang),
    fundoA,
  );
  n = s2.end_north;
  e = s2.end_east;
  const s3 = lineSeg(3, n, e, n, e - fundoB, fundoB);
  n = s3.end_north;
  e = s3.end_east;
  const s4 = lineSeg(4, n, e, 0, 0, esq);

  return {
    segs: [s0, s1, s2, s3, s4],
    expected: {
      frente,
      fundo: fundoA + fundoB,
      right: dir,
      left: esq,
    },
  };
}

function testLote4FrontNotStolenByLateral() {
  const { segs, expected } = buildLote4StyleSegments();
  const b = block(segs, {
    number: '4',
    front_segment_index: 1,
    // Valores persistidos do bug em produção (antes):
    frente: expected.persistedBugFrente, // ~47,71 = 18,48+29,33 (sem 13,10)
    Fundo: 63.38,
    'Lado Dir.': 247.11,
    'Lado Esq.': expected.persistedBugEsq, // ~258,21 (lateral + 13,10)
  });

  // ANTES (persistido / bug): frente incompleta
  assert(
    near(Number(b.frente), 47.71, 0.05),
    'fixture antes: frente persistida ~47,71',
  );
  assert(
    near(Number(b['Lado Esq.']), 258.21, 0.05),
    'fixture antes: lateral esq inflada ~258,21',
  );

  const m = getOfficialLotMeasurements(b, '4');
  const frontIdxs = m.sides?.front.segmentIndexes ?? [];
  const backIdxs = m.sides?.back.segmentIndexes ?? [];
  const leftIdxs = m.sides?.left.segmentIndexes ?? [];
  const rightIdxs = m.sides?.right.segmentIndexes ?? [];

  // DEPOIS: frente completa 13,10+18,48+29,33
  assert(frontIdxs.includes(0), `frente deve incluir idx0 (13,10); got ${frontIdxs}`);
  assert(
    frontIdxs.includes(1) && frontIdxs.includes(2),
    `frente idxs ${frontIdxs}`,
  );
  assert(
    !leftIdxs.includes(0) && !rightIdxs.includes(0),
    '13,10 não pode ir para lateral',
  );
  assert(
    near(m.frente, expected.frente, 0.5),
    `depois frente ${m.frente} ~ ${expected.frente}`,
  );
  assert(
    Math.abs(Number(m.frente) - 47.71) > 5,
    'depois frente não pode permanecer ~47,71',
  );
  assert(near(m.fundo, expected.fundo, 0.8), `fundo ${m.fundo} ~ ${expected.fundo}`);
  assert(
    Math.abs(Number(m.ladoEsquerdo) - 258.21) > 5,
    'lado esq não pode ficar no valor inflado 258,21',
  );
  assert(near(m.ladoDireito, expected.right, 3), `dir ${m.ladoDireito}`);
  assert(near(m.ladoEsquerdo, expected.left, 5), `esq ${m.ladoEsquerdo}`);
  assertDisjointSides(m, 'lote4');
  assert(
    backIdxs.every((i) => !frontIdxs.includes(i) && !leftIdxs.includes(i) && !rightIdxs.includes(i)),
    'fundo não compartilha índices',
  );

  const modal = resolveLotMeasuresFromBlock(b);
  const contract = resolveContractLotSides(b);
  assert(near(modal.sides.frente, m.frente!, 0.05), 'modal frente = official');
  assert(near(Number(contract.frente), m.frente!, 0.05), 'contrato frente = official');
  assert(near(modal.sides.fundo, m.fundo!, 0.05), 'modal fundo = official');
  // Sem fallback para coluna persistida 47,71
  assert(m.source === 'txt_segments', `source ${m.source}`);

  console.log('OK testLote4FrontNotStolenByLateral', {
    before: { frente: 47.71, esq: 258.21 },
    after: {
      frente: m.frente,
      fundo: m.fundo,
      dir: m.ladoDireito,
      esq: m.ladoEsquerdo,
      frontIdxs,
      backIdxs,
    },
  });
}

function testLote3FundoNotSingleSegment() {
  const { segs, expected } = buildLote3StyleSegments();
  const b = block(segs, {
    number: '3',
    front_segment_index: 0,
    frente: 34.49,
    Fundo: '16.58', // persistido incompleto
    'Lado Dir.': 245.31,
    'Lado Esq.': 258.23,
  });

  const m = getOfficialLotMeasurements(b, '3');
  assert(m.fundo !== 16.58, `fundo não pode ficar 16,58; got ${m.fundo}`);
  assert(near(m.fundo, expected.fundo, 0.5), `fundo ${m.fundo} ~ ${expected.fundo}`);
  assert(near(m.fundo, 34.6, 0.2), `fundo ~34,60 got ${m.fundo}`);

  const backIdxs = m.sides?.back.segmentIndexes ?? [];
  const leftIdxs = m.sides?.left.segmentIndexes ?? [];
  const rightIdxs = m.sides?.right.segmentIndexes ?? [];
  assert(backIdxs.includes(2) && backIdxs.includes(3), `fundo idxs ${backIdxs}`);
  assert(
    !leftIdxs.includes(2) &&
      !leftIdxs.includes(3) &&
      !rightIdxs.includes(2) &&
      !rightIdxs.includes(3),
    'índices do fundo não entram nas laterais',
  );
  assertDisjointSides(m, 'lote3');
  assert(m.source === 'txt_segments', `source ${m.source}`);

  const modal = resolveLotMeasuresFromBlock(b);
  const contract = resolveContractLotSides(b);
  assert(near(modal.sides.fundo, m.fundo!, 0.05), 'popup=official fundo');
  assert(near(Number(contract.fundo), m.fundo!, 0.05), 'contrato=official fundo');
  assert(near(modal.sides.fundo, Number(contract.fundo), 0.05), 'popup=contrato');
  assert(Number(modal.sides.fundo) !== 16.58, 'sem fallback 16,58 no modal');

  console.log('OK testLote3FundoNotSingleSegment', {
    before: { fundo: 16.58 },
    after: { fundo: m.fundo, backIdxs, dir: m.ladoDireito, esq: m.ladoEsquerdo },
  });
}

function testNoMutationOfSegmentsJson() {
  const { segs } = buildLote4StyleSegments();
  const snapshot = JSON.stringify(segs);
  const frozen = segs.map((s) => Object.freeze({ ...s }));
  const b = block(frozen as typeof segs, { front_segment_index: 1 });
  Object.freeze(b.segments_json);

  const orderedCopy = parseOfficialSegmentsFromBlock(b);
  const forbidden = new Set<number>();
  const byIdx = new Map(orderedCopy.map((s) => [s.segment_index, s]));
  expandChainByConsecutiveDeflection(
    orderedCopy,
    [1],
    forbidden,
    byIdx,
    BOUNDARY_CHAIN_MAX_DEFLECTION_DEG,
  );

  getOfficialLotMeasurements(b, 'MUT');
  resolveLotMeasuresFromBlock(b);

  assert(
    Array.isArray(b.segments_json) && b.segments_json.length === frozen.length,
    'segments_json intacto',
  );
  assert(JSON.stringify(b.segments_json) === snapshot, 'conteúdo segments_json não mutado');
  console.log('OK testNoMutationOfSegmentsJson');
}

function testConfrontationEditorDoesNotThrow() {
  const { segs } = buildLote4StyleSegments();
  const b = block(segs, { id: 'lot-4-test', front_segment_index: 1 });
  const load = loadLotConfrontations({
    lot: b,
    allBlocks: [b],
    streetGuides: [],
  });
  assert(load.status !== 'error', `load confrontações: ${load.error}`);

  const targets = findPropagationTargets(
    [b],
    b,
    'lot-4-test',
    'fundo',
    'lot_only',
  );
  assert(Array.isArray(targets) && targets.length >= 1, 'targets');

  const targets2 = findPropagationTargets(
    [],
    { id: 'x' },
    'x',
    'frente',
    'lot_only',
  );
  assert(Array.isArray(targets2), 'targets empty blocks');
  console.log('OK testConfrontationEditorDoesNotThrow');
}

function testConsecutiveExpandRules() {
  const segs = [
    lineSeg(0, 0, 0, 0, 30, 30),
    lineSeg(1, 0, 30, 40, 30, 40),
    lineSeg(2, 40, 30, 43, 27, 4.24),
    lineSeg(3, 43, 27, 43, 0, 27),
    lineSeg(4, 43, 0, 0, 0, 43),
  ];
  const ordered = parseOfficialSegmentsFromBlock({
    segments_json: segs,
    source_import: 'TXT_CIVIL3D',
  });
  const byIdx = new Map(ordered.map((s) => [s.segment_index, s]));
  const forbidden = new Set([3]);
  const expanded = expandChainByConsecutiveDeflection(
    ordered,
    [0],
    forbidden,
    byIdx,
    BOUNDARY_CHAIN_MAX_DEFLECTION_DEG,
  );
  assert(expanded.includes(0), 'seed');
  assert(!expanded.includes(3), 'respeita forbidden');
  assert(new Set(expanded).size === expanded.length, 'sem duplicatas');
  console.log('OK testConsecutiveExpandRules', expanded);
}

function testParseDistanceFields() {
  assert(parsePositiveSegmentLength(16.58) === 16.58, 'number');
  assert(parsePositiveSegmentLength('16,58') === 16.58, 'string pt-BR');
  assert(parsePositiveSegmentLength('16.58') === 16.58, 'string en');
  assert(parsePositiveSegmentLength('abc') == null, 'string inválida');
  assert(parsePositiveSegmentLength('') == null, 'vazio');
  assert(parsePositiveSegmentLength(0) == null, 'zero');
  assert(parsePositiveSegmentLength(-5) == null, 'negativo');
  assert(parsePositiveSegmentLength(NaN) == null, 'NaN');

  const fromDistance = parseSegmentLengthsFromJson([
    { segment_index: 0, distance: 16.58 },
    { segment_index: 1, distance: '18,02' },
    { segment_index: 2, length: 99 }, // distance tem prioridade; sem distance usa length
  ]);
  assert(fromDistance[0] === 16.58, 'distance numérico');
  assert(fromDistance[1] === 18.02, 'distance string');
  assert(fromDistance[2] === 99, 'fallback length');

  const preferDistance = parseSegmentLengthsFromJson([
    { distance: 13.1, length: 999 },
  ]);
  assert(preferDistance[0] === 13.1, 'distance > length');

  const invalidSkipped = parseSegmentLengthsFromJson([
    { distance: 'nao-numero' },
    { length: 'x' },
    { distance: 10 },
  ]);
  assert(invalidSkipped.length === 1 && invalidSkipped[0] === 10, 'ignora inválidos');

  console.log('OK testParseDistanceFields', {
    fromDistance,
    preferDistance,
    invalidSkipped,
  });
}

function main() {
  testLote4FrontNotStolenByLateral();
  testLote3FundoNotSingleSegment();
  testNoMutationOfSegmentsJson();
  testConfrontationEditorDoesNotThrow();
  testConsecutiveExpandRules();
  testParseDistanceFields();
  console.log('mandatory-meneses-qd06-boundary-tests: all passed');
}

main();
