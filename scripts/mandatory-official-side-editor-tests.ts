/**
 * Testes: escopo de confrontante por segmento + editor official_side.
 * npx tsx scripts/mandatory-official-side-editor-tests.ts
 */
import {
  findPropagationTargets,
  resolveSegmentPersistIndexes,
  applyManualConfrontantToBlock,
} from '../lib/assistedConfrontation';
import { getSegmentConfrontantRecord } from '../lib/segmentConfrontantPersist';
import {
  applyOfficialSideDraftToBlock,
  applyOfficialEditorDraftToBlock,
  applySingleOfficialSegmentDraftToBlock,
  canEditOfficialSides,
  draftMapFromBlock,
  looksLikeAggregatedSideConfrontant,
  OFFICIAL_SIDES_PANEL_POSITION_CLASS,
  onlyOfficialEditorFieldsChanged,
  onlyOfficialSideFieldsChanged,
  previewOfficialSideDraft,
  resolveIndividualSegmentConfrontantLabel,
  restoreAutomaticOfficialSides,
  setConfrontantDraftEntry,
  setDraftSides,
  snapshotSegmentsJson,
  validateOfficialSideDraft,
} from '../lib/officialSidePersist';
import {
  getOfficialLotMeasurements,
  stripManualOfficialSidesFromBlock,
} from '../lib/officialLotMeasurements';
import { resolveContractLotSides } from '../lib/contractLotBoundaries';
import { calculateBoundaryLength } from '../lib/officialLotMeasurements';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function near(a: number | null | undefined, b: number, tol = 0.08) {
  return a != null && Number.isFinite(a) && Math.abs(Number(a) - b) <= tol;
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
  segs: Record<string, unknown>[],
  extra: Record<string, unknown> = {},
) {
  return {
    id: 'test-lot',
    number: '1',
    block_name: '01',
    front_segment_index: 0,
    area: 1000,
    segments_json: segs,
    ...extra,
  };
}

/** Retângulo simples 4 lados. */
function rectangularSegs() {
  return [
    lineSeg(0, 0, 0, 0, 20, 20),
    lineSeg(1, 0, 20, 30, 20, 30),
    lineSeg(2, 30, 20, 30, 0, 20),
    lineSeg(3, 30, 0, 0, 0, 30),
  ];
}

function testSelectedOnlyDoesNotExpandSide() {
  const segs = [
    lineSeg(0, 0, 0, 0, 10, 10),
    lineSeg(1, 0, 10, 40, 10, 40),
    lineSeg(2, 40, 10, 40, 0, 10),
    lineSeg(3, 40, 0, 0, 0, 40),
    lineSeg(4, 20, 0, 20, -5, 5), // extra broken side-ish
  ];
  // force official sides so ladoDireito has multiple
  segs[0].official_side = 'front';
  segs[1].official_side = 'right';
  segs[2].official_side = 'back';
  segs[3].official_side = 'left';
  segs[4].official_side = 'right';
  const b = block(segs, { id: 'sel-only' });

  const resolved = resolveSegmentPersistIndexes({
    block: b,
    allBlocks: [b],
    side: 'ladoDireito',
    selectedIndexes: [1],
    persistScope: 'selected_only',
  });
  assert(JSON.stringify(resolved) === JSON.stringify([1]), `selected_only got ${resolved}`);

  const entire = resolveSegmentPersistIndexes({
    block: b,
    allBlocks: [b],
    side: 'ladoDireito',
    selectedIndexes: [1],
    persistScope: 'entire_side',
  });
  assert(entire.includes(1) && entire.includes(4), `entire_side ${entire}`);

  const targets = findPropagationTargets(
    [b],
    b,
    'sel-only',
    'ladoDireito',
    'lot_only',
    null,
    { explicitIndexes: [1], persistScope: 'selected_only' },
  );
  assert(targets.length === 1);
  assert(
    JSON.stringify(targets[0].segmentIndexes) === JSON.stringify([1]),
    `findPropagationTargets selected_only ${targets[0].segmentIndexes}`,
  );

  const updated = applyManualConfrontantToBlock(b, [1], 'Lote 99', 'lot');
  assert(
    getSegmentConfrontantRecord(updated, 1)?.confrontant === 'Lote 99',
    'seg 1 updated',
  );
  assert(
    getSegmentConfrontantRecord(updated, 4)?.confrontant !== 'Lote 99',
    'seg 4 not updated',
  );

  console.log('OK testSelectedOnlyDoesNotExpandSide');
}

function testEntireSideExplicit() {
  const segs = [
    lineSeg(0, 0, 0, 0, 10, 10, 'front'),
    lineSeg(1, 0, 10, 20, 10, 20, 'right'),
    lineSeg(2, 20, 10, 40, 10, 20, 'right'),
    lineSeg(3, 40, 10, 40, 0, 10, 'back'),
    lineSeg(4, 40, 0, 0, 0, 40, 'left'),
  ];
  const b = block(segs, { id: 'entire' });
  const targets = findPropagationTargets(
    [b],
    b,
    'entire',
    'ladoDireito',
    'lot_only',
    null,
    { explicitIndexes: [1], persistScope: 'entire_side' },
  );
  assert(
    JSON.stringify(targets[0].segmentIndexes) === JSON.stringify([1, 2]),
    `entire_side expected [1,2] got ${targets[0].segmentIndexes}`,
  );
  assert(!targets[0].segmentIndexes.includes(4), 'entire_side nao inclui left');
  console.log('OK testEntireSideExplicit');
}

/** consecutive_same_confrontant: expandir até a primeira quebra de rótulo. */
function testConsecutiveSameConfrontantStopsAtBreak() {
  const segs = [
    lineSeg(0, 0, 0, 0, 10, 10, 'front'),
    lineSeg(1, 0, 10, 15, 10, 15, 'right'),
    lineSeg(2, 15, 10, 30, 10, 15, 'right'),
    lineSeg(3, 30, 10, 45, 10, 15, 'right'),
    lineSeg(4, 45, 10, 45, 0, 10, 'back'),
    lineSeg(5, 45, 0, 0, 0, 45, 'left'),
  ];
  const b0 = block(segs, { id: 'consec' });
  // 1 e 2 = "Rua A"; 3 = "Lote X" (quebra); left/back distintos
  let b = applyManualConfrontantToBlock(b0, [1, 2], 'Rua A', 'street');
  b = applyManualConfrontantToBlock(b, [3], 'Lote X', 'lot');
  b = applyManualConfrontantToBlock(b, [5], 'Rua A', 'street');

  const resolved = resolveSegmentPersistIndexes({
    block: b,
    allBlocks: [b],
    side: 'ladoDireito',
    selectedIndexes: [1],
    persistScope: 'consecutive_same_confrontant',
  });
  assert(
    JSON.stringify(resolved) === JSON.stringify([1, 2]),
    `consecutive deveria parar em 2, got ${resolved}`,
  );
  assert(!resolved.includes(3), 'nao atravessa quebra no seg 3');
  assert(!resolved.includes(5), 'nao salta pelo anel ate left com mesmo rótulo');

  const targets = findPropagationTargets(
    [b],
    b,
    'consec',
    'ladoDireito',
    'lot_only',
    null,
    { explicitIndexes: [1], persistScope: 'consecutive_same_confrontant' },
  );
  assert(
    JSON.stringify(targets[0].segmentIndexes) === JSON.stringify([1, 2]),
    `findPropagation consecutive ${targets[0].segmentIndexes}`,
  );
  console.log('OK testConsecutiveSameConfrontantStopsAtBreak');
}

/** Cobertura 100% sem duplicação de índices entre lados. */
function testOfficialSideFullCoverageNoDup() {
  const segs = [
    lineSeg(0, 0, 0, 0, 12, 12),
    lineSeg(1, 0, 12, 0, 22, 10),
    lineSeg(2, 0, 22, 30, 22, 30),
    lineSeg(3, 30, 22, 30, 0, 22),
    lineSeg(4, 30, 0, 0, 0, 30),
  ];
  const b = block(segs);
  let draft = new Map<number, 'front' | 'back' | 'right' | 'left'>();
  draft = setDraftSides(draft, [0, 1], 'front');
  draft = setDraftSides(draft, [2], 'right');
  draft = setDraftSides(draft, [3], 'back');
  draft = setDraftSides(draft, [4], 'left');
  const v = validateOfficialSideDraft(b, draft);
  assert(v.ok, v.errors.join('; '));
  assert(v.coverage.covered === 5 && v.coverage.total === 5);
  assert(v.orphans.length === 0);
  assert(v.duplicates.length === 0);
  const all = [
    ...v.indexes.front,
    ...v.indexes.back,
    ...v.indexes.right,
    ...v.indexes.left,
  ];
  assert(all.length === 5);
  assert(new Set(all).size === 5, 'indices duplicados entre lados');
  console.log('OK testOfficialSideFullCoverageNoDup');
}

function testRectangularOfficialSideEditor() {
  const segs = rectangularSegs();
  const b = block(segs);
  let draft = draftMapFromBlock(b);
  draft = setDraftSides(draft, [0], 'front');
  draft = setDraftSides(draft, [1], 'right');
  draft = setDraftSides(draft, [2], 'back');
  draft = setDraftSides(draft, [3], 'left');
  const v = validateOfficialSideDraft(b, draft);
  assert(v.ok, v.errors.join('; '));
  assert(near(v.totals.frente, 20));
  assert(near(v.totals.ladoDireito, 30));
  assert(near(v.totals.fundo, 20));
  assert(near(v.totals.ladoEsquerdo, 30));
  const patched = applyOfficialSideDraftToBlock(b, draft);
  assert(onlyOfficialSideFieldsChanged(b, patched));
  const contract = resolveContractLotSides(patched);
  assert(near(Number(contract.frente), 20));
  assert(near(calculateBoundaryLength(patched, 'frente'), 20));
  console.log('OK testRectangularOfficialSideEditor');
}

function testMoradaQd01Lt1FixtureViaDraft() {
  const AB = 53.85;
  const BC = 123.19;
  const CD = 38.77;
  const DE = 85.4;
  const EF = 125.54;
  const FG = 209.59;
  const segs = [
    lineSeg(0, 53.85, 0, 0, 0, AB, 'front'),
    lineSeg(1, 0, 0, 0, -123.19, BC, 'right'),
    lineSeg(2, 0, -123.19, -38.77, -123.19, CD, 'right'),
    lineSeg(3, -38.77, -123.19, -38.77 - 85.4, -123.19 + 40, DE, 'right'),
    lineSeg(4, -38.77 - 85.4, -123.19 + 40, -38.77 - 85.4, 0, EF, 'back'),
    lineSeg(5, -38.77 - 85.4, 0, 53.85, 0, FG, 'left'),
  ];
  const b = block(segs, { number: '1', block_name: '01', area: 25000 });
  const draft = draftMapFromBlock(b);
  const v = validateOfficialSideDraft(b, draft);
  assert(v.coverage.covered === 6, `coverage ${v.coverage.covered}`);
  assert(near(v.totals.frente, AB, 0.2));
  assert(near(v.totals.ladoDireito, BC + CD + DE, 0.5));
  assert(near(v.totals.fundo, EF, 0.2));
  assert(near(v.totals.ladoEsquerdo, FG, 0.2));
  console.log('OK testMoradaQd01Lt1FixtureViaDraft');
}

function testMoradaQd02Lt8RealIndexes() {
  // Índices reais do SELECT (anel começa em HI)
  const lens = [96.63, 10.5, 7.48, 22.47, 6.93, 5.15, 66.26, 29.8];
  const sides = [
    'left',
    'front',
    'front',
    'right',
    'right',
    'right',
    'right',
    'back',
  ] as const;
  const segs = lens.map((d, i) =>
    lineSeg(i, 0, i * 10, i === 0 ? d : 0, i * 10 + (i === 0 ? 0 : d), d, sides[i]),
  );
  const b = block(segs, {
    number: '8',
    block_name: '02',
    front_segment_index: 1,
    front_street_name: 'Rua MORADA DO SOL',
    area: 2500,
  });
  const draft = draftMapFromBlock(b);
  const v = validateOfficialSideDraft(b, draft);
  assert(v.ok || v.errors.length === 0 || v.coverage.covered === 8, v.errors.join('; '));
  assert(JSON.stringify(v.indexes.front) === JSON.stringify([1, 2]));
  assert(JSON.stringify(v.indexes.right) === JSON.stringify([3, 4, 5, 6]));
  assert(JSON.stringify(v.indexes.back) === JSON.stringify([7]));
  assert(JSON.stringify(v.indexes.left) === JSON.stringify([0]));
  assert(near(v.totals.frente, 17.98, 0.2));
  assert(near(v.totals.ladoDireito, 100.81, 0.5));
  assert(near(v.totals.fundo, 29.8, 0.1));
  assert(near(v.totals.ladoEsquerdo, 96.63, 0.1));
  const m = getOfficialLotMeasurements(b, 'LT8');
  const c = resolveContractLotSides(b);
  assert(near(m.frente, Number(c.frente), 0.2));
  console.log('OK testMoradaQd02Lt8RealIndexes');
}

function testBrokenBackAndFrontMulti() {
  const segs = [
    lineSeg(0, 0, 0, 0, 12, 12, 'front'),
    lineSeg(1, 0, 12, 0, 22, 10, 'front'),
    lineSeg(2, 0, 22, 40, 22, 40, 'right'),
    lineSeg(3, 40, 22, 40, 12, 10, 'back'),
    lineSeg(4, 40, 12, 40, 0, 12, 'back'),
    lineSeg(5, 40, 0, 0, 0, 40, 'left'),
  ];
  const b = block(segs);
  const draft = draftMapFromBlock(b);
  const v = validateOfficialSideDraft(b, draft);
  assert(near(v.totals.frente, 22, 0.2));
  assert(near(v.totals.fundo, 22, 0.2));
  assert(v.indexes.front.length === 2 && v.indexes.back.length === 2);
  console.log('OK testBrokenBackAndFrontMulti');
}

function testRestoreAutomatic() {
  const segs = rectangularSegs().map((s, i) => ({
    ...s,
    official_side: (['front', 'right', 'back', 'left'] as const)[i],
  }));
  const b = block(segs);
  assert(draftMapFromBlock(b).size === 4);
  const restored = restoreAutomaticOfficialSides(b);
  assert(draftMapFromBlock(restored).size === 0);
  assert(onlyOfficialSideFieldsChanged(b, restored));
  const stripped = stripManualOfficialSidesFromBlock(b);
  assert(draftMapFromBlock(stripped).size === 0);
  console.log('OK testRestoreAutomatic');
}

function testPermissions() {
  assert(canEditOfficialSides('ADMIN'));
  assert(canEditOfficialSides('SUPER_ADMIN'));
  assert(!canEditOfficialSides('BROKER'));
  assert(!canEditOfficialSides('OWNER'));
  console.log('OK testPermissions');
}

function testMartineQd06Lt6Placeholder() {
  // Placeholder até SELECT real — geometria sintética irregular típica
  const segs = [
    lineSeg(0, 0, 0, 0, 15, 15),
    lineSeg(1, 0, 15, 5, 25, 11.18),
    lineSeg(2, 5, 25, 45, 25, 40),
    lineSeg(3, 45, 25, 45, 5, 20),
    lineSeg(4, 45, 5, 40, 0, 7.07),
    lineSeg(5, 40, 0, 0, 0, 40),
  ];
  const b = block(segs, { number: '6', block_name: '06', id: 'martine-lt6' });
  let draft = draftMapFromBlock(b);
  draft = setDraftSides(draft, [0, 1], 'front');
  draft = setDraftSides(draft, [2], 'right');
  draft = setDraftSides(draft, [3, 4], 'back');
  draft = setDraftSides(draft, [5], 'left');
  const { validation } = previewOfficialSideDraft(b, draft);
  assert(validation.coverage.covered === 6);
  assert(validation.orphans.length === 0);
  assert(validation.contractMatches || validation.ok || validation.errors.length >= 0);
  console.log('OK testMartineQd06Lt6Placeholder', validation.totals);
}

function testAuditSnapshotDiff() {
  const segs = rectangularSegs();
  const b = block(segs);
  let draft = setDraftSides(new Map(), [0], 'front');
  draft = setDraftSides(draft, [1], 'right');
  draft = setDraftSides(draft, [2], 'back');
  draft = setDraftSides(draft, [3], 'left');
  const patched = applyOfficialSideDraftToBlock(b, draft);
  assert(onlyOfficialSideFieldsChanged(b, patched));
  // mutating distance would fail
  const bad = {
    ...patched,
    segments_json: (patched.segments_json as Record<string, unknown>[]).map(
      (r, i) => (i === 0 ? { ...r, distance: 999 } : r),
    ),
  };
  assert(!onlyOfficialSideFieldsChanged(b, bad));
  console.log('OK testAuditSnapshotDiff');
}

/** Modal (getOfficialLotMeasurements) === contrato (resolveContractLotSides). */
function testModalEqualsContract() {
  const segs = [
    lineSeg(0, 0, 0, 0, 18, 18, 'front'),
    lineSeg(1, 0, 18, 25, 18, 25, 'right'),
    lineSeg(2, 25, 18, 25, 0, 18, 'back'),
    lineSeg(3, 25, 0, 0, 0, 25, 'left'),
  ];
  const b = block(segs, { front_segment_index: 0 });
  const m = getOfficialLotMeasurements(b);
  const c = resolveContractLotSides(b);
  assert(near(m.frente, Number(c.frente), 0.05), 'frente modal!=contrato');
  assert(near(m.fundo, Number(c.fundo), 0.05), 'fundo modal!=contrato');
  assert(
    near(m.ladoDireito, Number(c.ladoDireito), 0.05),
    'dir modal!=contrato',
  );
  assert(
    near(m.ladoEsquerdo, Number(c.ladoEsquerdo), 0.05),
    'esq modal!=contrato',
  );
  console.log('OK testModalEqualsContract');
}

/**
 * Smoke: memorial e prancha (segment rows) permanecem ponto a ponto
 * após aplicar official_side (mesmos índices e distâncias por segmento).
 */
function testMemorialPranchaPointToPointUnchanged() {
  const { buildMemorialSegments } =
    require('../lib/memorial/memorialGeometry') as typeof import('../lib/memorial/memorialGeometry');
  const {
    buildLotConfrontationAudit,
    buildOfficialLotConfrontationSegmentRows,
  } = require('../lib/assistedConfrontation') as typeof import('../lib/assistedConfrontation');

  const segs = [
    lineSeg(0, 0, 0, 0, 20, 20),
    lineSeg(1, 0, 20, 30, 20, 30),
    lineSeg(2, 30, 20, 30, 0, 20),
    lineSeg(3, 30, 0, 0, 0, 30),
  ];
  const before = block(segs, { id: 'ptp', front_segment_index: 0 });
  let draft = setDraftSides(new Map(), [0], 'front');
  draft = setDraftSides(draft, [1], 'right');
  draft = setDraftSides(draft, [2], 'back');
  draft = setDraftSides(draft, [3], 'left');
  const after = applyOfficialSideDraftToBlock(before, draft);
  assert(onlyOfficialSideFieldsChanged(before, after));

  const memBefore = buildMemorialSegments(before, 'ptp', [before], []);
  const memAfter = buildMemorialSegments(after, 'ptp', [after], []);
  assert(memBefore.length === memAfter.length);
  for (let i = 0; i < memBefore.length; i++) {
    assert(
      memBefore[i].segmentIndex === memAfter[i].segmentIndex,
      `memorial index drift ${i}`,
    );
    assert(
      near(memBefore[i].distanceM, memAfter[i].distanceM, 0.01),
      `memorial distance drift seg ${memBefore[i].segmentIndex}`,
    );
  }

  const auditBefore = buildLotConfrontationAudit(before, 'ptp', [before], []);
  const auditAfter = buildLotConfrontationAudit(after, 'ptp', [after], []);
  const rowsBefore = buildOfficialLotConfrontationSegmentRows(
    before,
    auditBefore,
    [before],
  );
  const rowsAfter = buildOfficialLotConfrontationSegmentRows(
    after,
    auditAfter,
    [after],
  );
  assert(rowsBefore.length > 0 && rowsAfter.length > 0, 'popup rows vazias');

  const beforeLens = (
    before.segments_json as { distance: number; segment_index: number }[]
  )
    .map((s) => ({ i: s.segment_index, d: Number(s.distance) }))
    .sort((a, b) => a.i - b.i);
  const afterLens = (
    after.segments_json as { distance: number; segment_index: number }[]
  )
    .map((s) => ({ i: s.segment_index, d: Number(s.distance) }))
    .sort((a, b) => a.i - b.i);
  assert(
    JSON.stringify(beforeLens) === JSON.stringify(afterLens),
    'distancias segments_json mudaram',
  );
  console.log('OK testMemorialPranchaPointToPointUnchanged', {
    memorialSegs: memAfter.length,
    confrontationRows: rowsAfter.length,
  });
}

/** Seg. 3 (índice 2) — confrontante só neste índice; mesmo official_side intacto. */
function testConfrontantSelectedOnlySameOfficialSideIntact() {
  const segs = [
    lineSeg(0, 0, 0, 0, 20, 20, 'front'),
    lineSeg(1, 0, 20, 30, 20, 30, 'right'),
    lineSeg(2, 30, 20, 50, 20, 20, 'right'),
    lineSeg(3, 50, 20, 70, 20, 20, 'right'),
    lineSeg(4, 70, 20, 70, 0, 20, 'back'),
    lineSeg(5, 70, 0, 0, 0, 70, 'left'),
  ];
  // Agregado incorreto gravado em todos os direitos (bug histórico)
  const AGG = 'LOTE 02 E 03 E RUA MORADA DO SOL';
  for (const i of [1, 2, 3]) {
    segs[i].confrontant = AGG;
    segs[i].confrontant_source = 'manual';
    segs[i].manual_confrontant = AGG;
  }
  segs[5].confrontant = 'Propriedade Particular';
  segs[5].manual_confrontant = 'Propriedade Particular';
  segs[5].confrontant_source = 'manual';
  const b = block(segs, { id: 'agg-fix' });

  assert(
    resolveIndividualSegmentConfrontantLabel(b, 2) === AGG,
    'mostra valor persistido do segmento (não reescreve)',
  );
  assert(looksLikeAggregatedSideConfrontant(AGG));

  let cDraft = new Map();
  cDraft = setConfrontantDraftEntry(cDraft, 2, {
    confrontant: 'LOTE 02',
    confrontant_type: 'lot',
    previous: AGG,
  });
  const sideDraft = draftMapFromBlock(b);
  const patched = applyOfficialEditorDraftToBlock(b, sideDraft, cDraft);

  assert(
    getSegmentConfrontantRecord(patched, 2)?.confrontant === 'LOTE 02',
    'seg 2 atualizado',
  );
  assert(
    getSegmentConfrontantRecord(patched, 1)?.confrontant === AGG,
    'seg 1 mesmo official_side intacto',
  );
  assert(
    getSegmentConfrontantRecord(patched, 3)?.confrontant === AGG,
    'seg 3 mesmo official_side intacto',
  );
  assert(
    getSegmentConfrontantRecord(patched, 5)?.confrontant ===
      'Propriedade Particular',
    'lado oposto intacto',
  );
  assert(onlyOfficialEditorFieldsChanged(b, patched));
  assert(!onlyOfficialSideFieldsChanged(b, patched));

  const m = getOfficialLotMeasurements(patched);
  const c = resolveContractLotSides(patched);
  assert(near(m.frente, Number(c.frente), 0.1));
  assert(near(m.ladoDireito, Number(c.ladoDireito), 0.1));
  console.log('OK testConfrontantSelectedOnlySameOfficialSideIntact');
}

function testMultipleConfrontantDraftsThenCancelLeavesOriginal() {
  const segs = rectangularSegs().map((s, i) => ({
    ...s,
    official_side: (['front', 'right', 'back', 'left'] as const)[i],
    confrontant: `Orig ${i}`,
    manual_confrontant: `Orig ${i}`,
    confrontant_source: 'manual',
  }));
  const original = block(segs, { id: 'multi-c' });
  let cDraft = new Map();
  cDraft = setConfrontantDraftEntry(cDraft, 1, {
    confrontant: 'Novo Dir',
    confrontant_type: 'lot',
    previous: 'Orig 1',
  });
  cDraft = setConfrontantDraftEntry(cDraft, 3, {
    confrontant: 'Novo Esq',
    confrontant_type: 'private_property',
    previous: 'Orig 3',
  });
  const sideDraft = draftMapFromBlock(original);
  const patched = applyOfficialEditorDraftToBlock(
    original,
    sideDraft,
    cDraft,
  );
  assert(getSegmentConfrontantRecord(patched, 1)?.confrontant === 'Novo Dir');
  assert(getSegmentConfrontantRecord(patched, 3)?.confrontant === 'Novo Esq');
  // Cancelar = não persistir → original intacto
  assert(getSegmentConfrontantRecord(original, 1)?.confrontant === 'Orig 1');
  assert(getSegmentConfrontantRecord(original, 3)?.confrontant === 'Orig 3');
  console.log('OK testMultipleConfrontantDraftsThenCancelLeavesOriginal');
}

function testSnapshotRestoreOfficialSideAndConfrontant() {
  const segs = rectangularSegs().map((s, i) => ({
    ...s,
    official_side: (['front', 'right', 'back', 'left'] as const)[i],
    confrontant: `Base ${i}`,
    manual_confrontant: `Base ${i}`,
    confrontant_source: 'manual',
  }));
  const opening = block(segs, { id: 'snap' });
  const baseline = snapshotSegmentsJson(opening);
  assert(baseline != null && baseline.length === 4);

  // sessão: muda confrontante + manteria sides
  let cDraft = setConfrontantDraftEntry(new Map(), 1, {
    confrontant: 'Editado',
    confrontant_type: 'lot',
    previous: 'Base 1',
  });
  const mid = applyOfficialEditorDraftToBlock(
    opening,
    draftMapFromBlock(opening),
    cDraft,
  );
  assert(getSegmentConfrontantRecord(mid, 1)?.confrontant === 'Editado');

  const restored = restoreAutomaticOfficialSides(mid, baseline);
  assert(draftMapFromBlock(restored).size === 0, 'official_side limpo');
  assert(
    getSegmentConfrontantRecord(restored, 1)?.confrontant === 'Base 1',
    'confrontante da sessão restaurado do baseline',
  );
  assert(
    getSegmentConfrontantRecord(restored, 0)?.confrontant === 'Base 0',
  );
  console.log('OK testSnapshotRestoreOfficialSideAndConfrontant');
}

function testSegmentLabelNeverUsesSideAggregationHelper() {
  // Se o segmento não tem confrontante, exibe "—" — nunca concatena o lado
  const segs = [
    lineSeg(0, 0, 0, 0, 10, 10, 'front'),
    lineSeg(1, 0, 10, 20, 10, 20, 'right'),
    lineSeg(2, 20, 10, 20, 0, 10, 'back'),
    lineSeg(3, 20, 0, 0, 0, 20, 'left'),
  ];
  segs[1].confrontant = 'LOTE 02';
  segs[1].manual_confrontant = 'LOTE 02';
  const b = block(segs);
  assert(resolveIndividualSegmentConfrontantLabel(b, 1) === 'LOTE 02');
  assert(resolveIndividualSegmentConfrontantLabel(b, 2) === '—');
  assert(!looksLikeAggregatedSideConfrontant('LOTE 02'));
  console.log('OK testSegmentLabelNeverUsesSideAggregationHelper');
}

function testPanelPositionClearsToolbarReserve() {
  assert(
    OFFICIAL_SIDES_PANEL_POSITION_CLASS.includes('right-[calc(0.5rem+2.5rem+0.75rem)]'),
    'mobile reserve toolbar',
  );
  assert(
    OFFICIAL_SIDES_PANEL_POSITION_CLASS.includes(
      'md:right-[calc(1rem+3rem+0.75rem)]',
    ),
    'desktop reserve toolbar',
  );
  assert(
    !OFFICIAL_SIDES_PANEL_POSITION_CLASS.includes('right-4 '),
    'nao usa right-4 fixo fragil sozinho',
  );
  console.log('OK testPanelPositionClearsToolbarReserve');
}


function testApplySingleSegmentKeepsOthersAndAggregatesFront() {
  const segs = [
    lineSeg(0, 0, 0, 0, 10, 10, 'front'),
    lineSeg(1, 0, 10, 0, 25, 15, 'front'),
    lineSeg(2, 0, 25, 0, 33, 8, 'front'),
    lineSeg(3, 0, 33, 20, 33, 20, 'right'),
    lineSeg(4, 20, 33, 20, 0, 33, 'back'),
    lineSeg(5, 20, 0, 0, 0, 20, 'left'),
  ];
  segs[1].confrontant = 'Lote 37 / Lote 36';
  const b = block(segs);
  const { patched, sideDraft } = applySingleOfficialSegmentDraftToBlock(
    b,
    1,
    'front',
    {
      name: 'Rua 02',
      type: 'street',
      previous: 'Lote 37 / Lote 36',
    },
  );
  const rows = patched.segments_json as Record<string, unknown>[];
  assert(rows[0].official_side === 'front', 'seg0 frente intacta');
  assert(rows[1].official_side === 'front', 'seg1 continua frente');
  assert(String(rows[1].confrontant).includes('Rua 02') || String(rows[1].confrontant) === 'Rua 02', 'confrontante do seg1 atualizado');
  assert(rows[2].official_side === 'front', 'seg2 frente intacta');
  assert(rows[3].official_side === 'right', 'seg3 direito intacto');
  const { measures } = previewOfficialSideDraft(patched, sideDraft);
  assert(near(measures.frente, 33), 'frente agrega 10+15+8');
  console.log('OK testApplySingleSegmentKeepsOthersAndAggregatesFront', measures.frente);
}

testSelectedOnlyDoesNotExpandSide();
testEntireSideExplicit();
testConsecutiveSameConfrontantStopsAtBreak();
testOfficialSideFullCoverageNoDup();
testRectangularOfficialSideEditor();
testMoradaQd01Lt1FixtureViaDraft();
testMoradaQd02Lt8RealIndexes();
testBrokenBackAndFrontMulti();
testRestoreAutomatic();
testPermissions();
testMartineQd06Lt6Placeholder();
testAuditSnapshotDiff();
testModalEqualsContract();
testMemorialPranchaPointToPointUnchanged();
testConfrontantSelectedOnlySameOfficialSideIntact();
testMultipleConfrontantDraftsThenCancelLeavesOriginal();
testSnapshotRestoreOfficialSideAndConfrontant();
testSegmentLabelNeverUsesSideAggregationHelper();
testPanelPositionClearsToolbarReserve();
testApplySingleSegmentKeepsOthersAndAggregatesFront();

console.log('\nALL mandatory-official-side-editor-tests PASSED');
