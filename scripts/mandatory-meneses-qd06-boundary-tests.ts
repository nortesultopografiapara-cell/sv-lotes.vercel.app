/**
 * Fixtures — geometria estilo Meneses QD 06 (chácaras longas) + HOTFIX 2.
 *
 * npx tsx scripts/mandatory-meneses-qd06-boundary-tests.ts
 */
import {
  getOfficialLotMeasurements,
  expandChainByConsecutiveDeflection,
  groupSegmentsByDeflection,
  parseOfficialSegmentsFromBlock,
  angularDifferenceDeg,
  BOUNDARY_CHAIN_MAX_DEFLECTION_DEG,
  isBoundaryChainLengthOutlier,
  shouldStopBoundaryChainForCombinedOutlier,
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
  bearing?: number,
) {
  return {
    segment_index: idx,
    north,
    east,
    end_north: endNorth,
    end_east: endEast,
    distance,
    segment_type: 'LINE' as const,
    ...(bearing != null ? { bearing } : {}),
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

function sideIndexes(
  m: ReturnType<typeof getOfficialLotMeasurements>,
) {
  return {
    f: m.sides?.front.segmentIndexes ?? [],
    b: m.sides?.back.segmentIndexes ?? [],
    r: m.sides?.right.segmentIndexes ?? [],
    l: m.sides?.left.segmentIndexes ?? [],
  };
}

function assertDisjointExactCoverage(
  m: ReturnType<typeof getOfficialLotMeasurements>,
  segmentCount: number,
  label: string,
) {
  const { f, b, r, l } = sideIndexes(m);
  const all = [...f, ...b, ...r, ...l];
  assert(
    new Set(all).size === all.length,
    `${label}: índices compartilhados ${JSON.stringify({ f, b, r, l })}`,
  );
  assert(
    all.length === segmentCount,
    `${label}: cobertura ${all.length}/${segmentCount} idxs=${JSON.stringify({ f, b, r, l })}`,
  );
  for (let i = 0; i < segmentCount; i++) {
    assert(all.includes(i), `${label}: índice ${i} ausente`);
  }
  const perimeterParts =
    Number(m.frente ?? 0) +
    Number(m.fundo ?? 0) +
    Number(m.ladoDireito ?? 0) +
    Number(m.ladoEsquerdo ?? 0);
  assert(
    m.perimeter == null || near(perimeterParts, Number(m.perimeter), 0.2),
    `${label}: soma lados ${perimeterParts} vs perímetro ${m.perimeter}`,
  );
}

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

/** Produção Lote 4: wrap [0,5,6,7] com idx5 ~246,7 m. */
function buildLote4WrapAbsorptionSegments() {
  const frontShort = [13.1, 18.48, 29.33] as const;
  const longLateral = 246.7;
  const segs = [
    lineSeg(0, 0, 0, 0, frontShort[0], frontShort[0], 90),
    lineSeg(1, 0, frontShort[0], 247.2, frontShort[0], 247.2, 0),
    lineSeg(2, 247.2, frontShort[0], 247.2, -5.36, 18.46, 270),
    lineSeg(3, 247.2, -5.36, 247.2, -34.19, 28.83, 270),
    lineSeg(4, 247.2, -34.19, 247.2, -50.79, 16.6, 270),
    lineSeg(5, 247.2, -50.79, 0.52, -50.79, longLateral, 78),
    lineSeg(6, 0.52, -50.79, 0.52, -32.31, frontShort[1], 85),
    lineSeg(7, 0.52, -32.31, 0, 0, frontShort[2], 88),
  ];
  return {
    segs,
    expected: {
      frente: frontShort[0] + frontShort[1] + frontShort[2],
      fundo: 18.46 + 28.83 + 16.6,
      longIdx: 5,
      longLen: longLateral,
      frontIdxs: [0, 6, 7],
      bugFrente: frontShort[0] + frontShort[1] + frontShort[2] + longLateral,
    },
  };
}

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

/**
 * OBRIGATÓRIO: caminho de fechamento colinear em groupSegmentsByDeflection
 * (antes: TypeError Assignment to constant variable em rawGroups = …).
 */
function testGroupSegmentsColinearRingClosureDoesNotThrow() {
  // Anel com primeiro e último grupo colineares no fechamento (≤30°).
  const segs = [
    lineSeg(0, 0, 0, 0, 20, 20, 90),
    lineSeg(1, 0, 20, 30, 20, 30, 0),
    lineSeg(2, 30, 20, 30, 0, 20, 270),
    lineSeg(3, 30, 0, 0, 0, 30, 88), // ~colinear com idx0 no fechamento
  ];
  const ordered = parseOfficialSegmentsFromBlock({
    segments_json: segs,
    source_import: 'TXT_CIVIL3D',
  });

  let groups;
  try {
    groups = groupSegmentsByDeflection(ordered, 'colinear-close');
  } catch (err) {
    throw new Error(
      `groupSegmentsByDeflection fechamento colinear lançou: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  assert(Array.isArray(groups) && groups.length >= 1, 'groups retornados');

  // Wrap Lote 4 também exercita o merge de fechamento.
  const wrap = buildLote4WrapAbsorptionSegments();
  const wrapOrdered = parseOfficialSegmentsFromBlock({
    segments_json: wrap.segs,
    source_import: 'TXT_CIVIL3D',
  });
  const wrapGroups = groupSegmentsByDeflection(wrapOrdered, '4-wrap-close');
  assert(Array.isArray(wrapGroups), 'wrap groups');

  console.log('OK testGroupSegmentsColinearRingClosureDoesNotThrow', {
    groups: groups.length,
    wrapGroups: wrapGroups.length,
  });
}

function testAngularWrapNearZero() {
  const d355_2 = angularDifferenceDeg(355, 2);
  const d2_8 = angularDifferenceDeg(2, 8);
  const d355_8 = angularDifferenceDeg(355, 8);
  assert(near(d355_2, 7, 0.5), `355° vs 2° → ~7°, got ${d355_2}`);
  assert(near(d2_8, 6, 0.5), `2° vs 8° → ~6°, got ${d2_8}`);
  assert(near(d355_8, 13, 0.5), `355° vs 8° → ~13°, got ${d355_8}`);
  assert(d355_2 < 20 && d355_8 < 20, 'não tratar como ~360° de afastamento');

  // Expansão com bearings próximos ao norte (wrap 359/0).
  const segs = [
    lineSeg(0, 0, 0, 10, 0.5, 10.01, 355),
    lineSeg(1, 10, 0.5, 20, 0.7, 10.02, 2),
    lineSeg(2, 20, 0.7, 30, 1.2, 10.05, 8),
    lineSeg(3, 30, 1.2, 30, 40, 38.8, 90),
    lineSeg(4, 30, 40, 0, 40, 30, 180),
    lineSeg(5, 0, 40, 0, 0, 40, 270),
  ];
  const ordered = parseOfficialSegmentsFromBlock({
    segments_json: segs,
    source_import: 'TXT_CIVIL3D',
  });
  const byIdx = new Map(ordered.map((s) => [s.segment_index, s]));
  const expanded = expandChainByConsecutiveDeflection(
    ordered,
    [0],
    new Set([3, 4, 5]),
    byIdx,
    BOUNDARY_CHAIN_MAX_DEFLECTION_DEG,
  );
  assert(
    expanded.includes(0) && expanded.includes(1) && expanded.includes(2),
    `cadeia 355/2/8 deve expandir; got ${expanded}`,
  );
  console.log('OK testAngularWrapNearZero', { d355_2, d2_8, d355_8, expanded });
}

function testLegitimateUnevenFrontNotRejectedByLengthAlone() {
  // Frente na mesma via: 12 m + 95 m (outlier por mediana, mas alinhados).
  assert(
    isBoundaryChainLengthOutlier(95, [12]),
    '95 vs 12 é outlier de comprimento (sinal)',
  );
  assert(
    !shouldStopBoundaryChainForCombinedOutlier({
      nextDistance: 95,
      chainDistances: [12],
      consecutiveDeflectionDeg: 5,
      globalDeflectionDeg: 8,
    }),
    'não rejeitar frente legítima só por outlier de comprimento',
  );

  // Lateral de chácara: combina outlier + escala.
  assert(
    shouldStopBoundaryChainForCombinedOutlier({
      nextDistance: 246.7,
      chainDistances: [13.1, 18.48, 29.33],
      consecutiveDeflectionDeg: 7,
      globalDeflectionDeg: 12,
    }),
    'lateral ~247 m deve parar a expansão',
  );

  const segs = [
    lineSeg(0, 0, 0, 0, 12, 12, 90),
    lineSeg(1, 0, 12, 0, 107, 95, 90), // mesmo bearing — trecho longo da via
    lineSeg(2, 0, 107, 40, 107, 40, 0),
    lineSeg(3, 40, 107, 40, 0, 107, 270),
    lineSeg(4, 40, 0, 0, 0, 40, 180),
  ];
  const b = block(segs, {
    number: 'uneven-front',
    front_segment_index: 0,
    front_street_name: 'RUA X',
  });
  const m = getOfficialLotMeasurements(b, 'uneven-front');
  const frontIdxs = m.sides?.front.segmentIndexes ?? [];
  assert(
    frontIdxs.includes(0) && frontIdxs.includes(1),
    `frente desigual deve incluir 0 e 1; got ${frontIdxs}`,
  );
  assert(near(m.frente, 107, 1), `frente ~107 m got ${m.frente}`);
  console.log('OK testLegitimateUnevenFrontNotRejectedByLengthAlone', {
    frontIdxs,
    frente: m.frente,
  });
}

function testLote4WrapDoesNotAbsorbLongLateral() {
  const { segs, expected } = buildLote4WrapAbsorptionSegments();
  const ordered = parseOfficialSegmentsFromBlock({
    segments_json: segs,
    source_import: 'TXT_CIVIL3D',
  });
  const byIdx = new Map(ordered.map((s) => [s.segment_index, s]));

  const legacyExpand = expandChainByConsecutiveDeflection(
    ordered,
    [0],
    new Set(),
    byIdx,
    {
      maxDeflectionDeg: BOUNDARY_CHAIN_MAX_DEFLECTION_DEG,
      maxGlobalDeflectionDeg: 180,
      rejectLengthOutliers: false,
      maxSegments: 99,
    },
  );
  assert(
    legacyExpand.includes(expected.longIdx),
    `fixture bug: legado inclui idx${expected.longIdx}; got ${legacyExpand}`,
  );

  const fixedExpand = expandChainByConsecutiveDeflection(
    ordered,
    [0],
    new Set(),
    byIdx,
    BOUNDARY_CHAIN_MAX_DEFLECTION_DEG,
  );
  assert(
    !fixedExpand.includes(expected.longIdx),
    `não absorver idx${expected.longIdx}; got ${fixedExpand}`,
  );
  assert(
    fixedExpand.includes(0) &&
      fixedExpand.includes(6) &&
      fixedExpand.includes(7) &&
      fixedExpand.length === 3,
    `frente wrap 0,6,7; got ${fixedExpand}`,
  );

  const b = block(segs, {
    number: '4',
    front_segment_index: 0,
    frente: expected.bugFrente,
  });
  const m = getOfficialLotMeasurements(b, '4');
  const { f, b: back, r, l } = sideIndexes(m);
  assert(
    f.length === 3 && f.includes(0) && f.includes(6) && f.includes(7),
    `frente idxs exatamente 0,6,7; got ${f}`,
  );
  assert(!f.includes(5), 'idx5 fora da frente');
  assert(near(m.frente, expected.frente, 0.5), `frente ${m.frente}`);
  assert(near(m.fundo, expected.fundo, 0.5), `fundo ${m.fundo}`);
  assert(near(m.ladoDireito, 247.2, 1) || near(m.ladoEsquerdo, 247.2, 1));
  assert(
    near(m.ladoDireito, expected.longLen, 1) ||
      near(m.ladoEsquerdo, expected.longLen, 1),
  );
  assertDisjointExactCoverage(m, segs.length, 'lote4-wrap');
  assert(
    ![...r, ...l, ...back].some((i) => f.includes(i)),
    'laterais/fundo não compartilham frente',
  );

  console.log('OK testLote4WrapDoesNotAbsorbLongLateral', {
    legacyExpand,
    fixedExpand,
    frente: m.frente,
    fundo: m.fundo,
    dir: m.ladoDireito,
    esq: m.ladoEsquerdo,
    f,
    back,
    r,
    l,
  });
}

function testLote4FrontNotStolenByLateral() {
  const { segs, expected } = buildLote4StyleSegments();
  const b = block(segs, {
    number: '4',
    front_segment_index: 1,
    frente: expected.persistedBugFrente,
    Fundo: 63.38,
    'Lado Dir.': 247.11,
    'Lado Esq.': expected.persistedBugEsq,
  });

  const m = getOfficialLotMeasurements(b, '4');
  const frontIdxs = m.sides?.front.segmentIndexes ?? [];
  assert(frontIdxs.includes(0) && frontIdxs.includes(1) && frontIdxs.includes(2));
  assert(near(m.frente, expected.frente, 0.5));
  assert(near(m.fundo, expected.fundo, 0.8));
  assert(near(m.ladoDireito, expected.right, 3));
  assert(near(m.ladoEsquerdo, expected.left, 5));
  assertDisjointExactCoverage(m, segs.length, 'lote4');

  const modal = resolveLotMeasuresFromBlock(b);
  const contract = resolveContractLotSides(b);
  assert(near(modal.sides.frente, m.frente!, 0.05));
  assert(near(Number(contract.frente), m.frente!, 0.05));
  console.log('OK testLote4FrontNotStolenByLateral', { frente: m.frente });
}

function testLote3FundoNotSingleSegment() {
  const { segs, expected } = buildLote3StyleSegments();
  const b = block(segs, {
    number: '3',
    front_segment_index: 0,
    frente: 34.49,
    Fundo: '16.58',
    'Lado Dir.': 245.31,
    'Lado Esq.': 258.23,
  });

  const m = getOfficialLotMeasurements(b, '3');
  assert(m.fundo !== 16.58, `fundo não pode ficar 16,58; got ${m.fundo}`);
  assert(near(m.fundo, expected.fundo, 0.5));
  assert(near(m.fundo, 34.6, 0.2));
  assert(near(m.frente, expected.frente, 0.2));
  const backIdxs = m.sides?.back.segmentIndexes ?? [];
  assert(backIdxs.includes(2) && backIdxs.includes(3));
  assertDisjointExactCoverage(m, segs.length, 'lote3');

  const modal = resolveLotMeasuresFromBlock(b);
  const contract = resolveContractLotSides(b);
  assert(near(modal.sides.fundo, m.fundo!, 0.05));
  assert(near(Number(contract.fundo), m.fundo!, 0.05));
  console.log('OK testLote3FundoNotSingleSegment', { fundo: m.fundo });
}

function testNoMutationOfSegmentsJson() {
  const { segs } = buildLote4StyleSegments();
  const snapshot = JSON.stringify(segs);
  const frozen = segs.map((s) => Object.freeze({ ...s }));
  const b = block(frozen as typeof segs, { front_segment_index: 1 });
  Object.freeze(b.segments_json);

  const orderedCopy = parseOfficialSegmentsFromBlock(b);
  const byIdx = new Map(orderedCopy.map((s) => [s.segment_index, s]));
  expandChainByConsecutiveDeflection(
    orderedCopy,
    [1],
    new Set(),
    byIdx,
    BOUNDARY_CHAIN_MAX_DEFLECTION_DEG,
  );
  getOfficialLotMeasurements(b, 'MUT');
  resolveLotMeasuresFromBlock(b);
  assert(JSON.stringify(b.segments_json) === snapshot, 'sem mutação');
  console.log('OK testNoMutationOfSegmentsJson');
}

function testConfrontationEditorDoesNotThrow() {
  const { segs } = buildLote4WrapAbsorptionSegments();
  const b = block(segs, { id: 'lot-4-test', front_segment_index: 0 });
  const load = loadLotConfrontations({
    lot: b,
    allBlocks: [b],
    streetGuides: [],
  });
  assert(load.status !== 'error', `load: ${load.error}`);

  const targets = findPropagationTargets(
    [b],
    b,
    'lot-4-test',
    'fundo',
    'lot_only',
  );
  assert(Array.isArray(targets) && targets.length >= 1);

  // Cancelar / reabrir
  const load2 = loadLotConfrontations({
    lot: b,
    allBlocks: [b],
    streetGuides: [],
  });
  assert(load2.status !== 'error', 'reload após cancel');

  // Fechamento colinear durante fluxo de edição
  groupSegmentsByDeflection(
    parseOfficialSegmentsFromBlock(b),
    'edit-flow',
  );

  console.log('OK testConfrontationEditorDoesNotThrow');
}

function testAutomaticConfrontationStateUpdate() {
  const { segs } = buildLote4WrapAbsorptionSegments();
  const b = block(segs, { id: 'lot-4-auto', front_segment_index: 0 });
  const m = getOfficialLotMeasurements(b, '4');
  assert(m.source === 'txt_segments');
  assert(m.frente != null && m.frente < 100);

  const load = loadLotConfrontations({
    lot: b,
    allBlocks: [b],
    streetGuides: [{ id: 'sg', name: 'RUA 05', type: 'Rua' } as never],
  });
  assert(load.status !== 'error', `audit: ${load.error}`);

  const targets = findPropagationTargets(
    [b],
    b,
    'lot-4-auto',
    'frente',
    'lot_only',
  );
  assert(Array.isArray(targets));

  // Reconstruir estado (segunda auditoria) sem TypeError
  const load2 = loadLotConfrontations({
    lot: b,
    allBlocks: [b],
    streetGuides: [],
  });
  assert(load2.status !== 'error');
  groupSegmentsByDeflection(parseOfficialSegmentsFromBlock(b), 'post-auto');

  console.log('OK testAutomaticConfrontationStateUpdate', { frente: m.frente });
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
  const expanded = expandChainByConsecutiveDeflection(
    ordered,
    [0],
    new Set([3]),
    byIdx,
    BOUNDARY_CHAIN_MAX_DEFLECTION_DEG,
  );
  assert(!expanded.includes(3), 'forbidden respeitado');
  console.log('OK testConsecutiveExpandRules', expanded);
}

function testParseDistanceFields() {
  assert(parsePositiveSegmentLength(16.58) === 16.58);
  assert(parsePositiveSegmentLength('16,58') === 16.58);
  const fromDistance = parseSegmentLengthsFromJson([
    { segment_index: 0, distance: 16.58 },
    { segment_index: 1, distance: '18,02' },
    { segment_index: 2, length: 99 },
  ]);
  assert(fromDistance[0] === 16.58 && fromDistance[1] === 18.02);
  console.log('OK testParseDistanceFields');
}

function main() {
  testGroupSegmentsColinearRingClosureDoesNotThrow();
  testAngularWrapNearZero();
  testLegitimateUnevenFrontNotRejectedByLengthAlone();
  testLote4WrapDoesNotAbsorbLongLateral();
  testLote4FrontNotStolenByLateral();
  testLote3FundoNotSingleSegment();
  testNoMutationOfSegmentsJson();
  testConfrontationEditorDoesNotThrow();
  testAutomaticConfrontationStateUpdate();
  testConsecutiveExpandRules();
  testParseDistanceFields();
  console.log('mandatory-meneses-qd06-boundary-tests: all passed');
}

main();
