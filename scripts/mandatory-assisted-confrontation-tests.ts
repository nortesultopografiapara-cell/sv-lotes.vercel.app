/**
 * GIS-005 — confrontação assistida
 * npx tsx scripts/mandatory-assisted-confrontation-tests.ts
 */

import {
  PENDING_CONFRONTANT_LABEL,
  normalizeConfrontantLabel,
} from '../lib/confrontantTypes';
import {
  applyManualConfrontantToBlock,
  buildLotConfrontationAudit,
  clearManualConfrontantFromBlock,
  confrontantsFromAudit,
  officialSegmentIndexesForSide,
} from '../lib/assistedConfrontation';
import { applyAutoFrontStreetToBlockSegments } from '../lib/autoFrontStreetSegments';
import { buildLotAuditPayload } from '../lib/lotAudit';
import { resolveMemorialSegmentConfrontant } from '../lib/memorial/memorialConfrontants';
import {
  clearManualConfrontantFromSegmentRows,
  getSegmentConfrontantRecord,
} from '../lib/segmentConfrontantPersist';
import { buildSideConfrontantsWithSources } from '../lib/lotSegmentConfrontation';
import {
  matchMergedSegmentIndexToWgs84RingEdge,
  utmSegmentIndexFromWgs84RingEdge,
  wgs84RingEdgeForMergedSegmentIndex,
} from '../lib/resolveFrontStreetGuide';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function utmRectSegments(
  east0: number,
  north0: number,
  w: number,
  h: number,
): Record<string, unknown>[] {
  const e1 = east0 + w;
  const n1 = north0 + h;
  return [
    {
      segment_index: 0,
      north: north0,
      east: east0,
      end_north: north0,
      end_east: e1,
      distance: w,
      segment_type: 'LINE',
    },
    {
      segment_index: 1,
      north: north0,
      east: e1,
      end_north: n1,
      end_east: e1,
      distance: h,
      segment_type: 'LINE',
    },
    {
      segment_index: 2,
      north: n1,
      east: e1,
      end_north: n1,
      end_east: east0,
      distance: w,
      segment_type: 'LINE',
    },
    {
      segment_index: 3,
      north: n1,
      east: east0,
      end_north: north0,
      end_east: east0,
      distance: h,
      segment_type: 'LINE',
    },
  ];
}

function block(id: string, num: string, east: number, north: number) {
  return {
    id,
    number: num,
    block_name: '02',
    front_segment_index: 0,
    front_street_name: 'RUA CENTRAL 01',
    segments_json: utmRectSegments(east, north, 12, 25),
  };
}

function testPendingLabel() {
  assert(
    normalizeConfrontantLabel('—') === PENDING_CONFRONTANT_LABEL,
    'traço vira A DEFINIR',
  );
  console.log('OK testPendingLabel');
}

function testManualOverridesAuto() {
  const b = block('a', '01', 50000, 7500000);
  const updated = applyManualConfrontantToBlock(
    b,
    [2],
    'Área Remanescente',
    'remnant_area',
  );
  const rec = getSegmentConfrontantRecord(updated, 2);
  assert(rec?.confrontant === 'Área Remanescente', 'manual no segmento 2');
  const built = buildSideConfrontantsWithSources(
    updated,
    'a',
    [],
    [updated],
    [],
  );
  assert(
    built.fundo === 'Área Remanescente' || built.ladoDireito === 'Área Remanescente',
    'lado com segmento 2 usa manual',
  );
  console.log('OK testManualOverridesAuto');
}

function testAuditPendingFundo() {
  const b1 = block('b1', '01', 50000, 7500000);
  const audit = buildLotConfrontationAudit(b1, 'b1', [b1], []);
  assert(audit.sides.frente.label.includes('CENTRAL'), 'frente com rua');
  assert(
    audit.sides.fundo.pending || audit.sides.fundo.label === PENDING_CONFRONTANT_LABEL,
    'fundo pendente ou A DEFINIR',
  );
  console.log('OK testAuditPendingFundo');
}

function testManualNotClearedByRebuild() {
  const b = block('c', '12', 50020, 7500000);
  let updated = applyManualConfrontantToBlock(b, [2], 'Área Verde', 'green_area');
  const again = buildSideConfrontantsWithSources(updated, 'c', [], [updated], []);
  assert(
    again.fundo === 'Área Verde' ||
      again.ladoDireito === 'Área Verde' ||
      again.ladoEsquerdo === 'Área Verde',
    'manual persiste no recálculo',
  );
  console.log('OK testManualNotClearedByRebuild');
}

const LAT0 = -23.5;
const LNG0 = -46.6;
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LNG = 111320 * Math.cos((LAT0 * Math.PI) / 180);

function rectBounds(w: number, h: number): [number, number][] {
  return [
    [LAT0, LNG0],
    [LAT0, LNG0 + w / M_PER_DEG_LNG],
    [LAT0 + h / M_PER_DEG_LAT, LNG0 + w / M_PER_DEG_LNG],
    [LAT0 + h / M_PER_DEG_LAT, LNG0],
  ];
}

function blockWithGeometry(
  id: string,
  num: string,
  east: number,
  north: number,
  w = 12,
  h = 25,
) {
  const bounds = rectBounds(w, h);
  const coords = bounds.map(([lat, lng]) => [lng, lat]);
  return {
    id,
    number: num,
    block_name: '02',
    front_segment_index: 0,
    front_street_name: 'RUA CENTRAL 01',
    bounds,
    geometry: { type: 'Polygon', coordinates: [coords] },
    segments_json: utmRectSegments(east, north, w, h),
  };
}

/** QA-004: ringEdgeIndex WGS84 deve corresponder ao segmentIndex UTM no mapa. */
function testSegmentEdgeWgs84UtmAlignment() {
  const b = blockWithGeometry('d1', '01', 50000, 7500000);
  const audit = buildLotConfrontationAudit(b, 'd1', [b], []);
  assert(audit.segmentEdges.length >= 4, 'segmentEdges preenchidos');

  const built = buildSideConfrontantsWithSources(b, 'd1', [], [b], []);
  for (const edge of audit.segmentEdges) {
    assert(
      typeof edge.segmentIndex === 'number',
      'segmentIndex UTM definido',
    );
    const mergedIdx = built.segments.findIndex(
      (s) => s.originalIndex === edge.segmentIndex,
    );
    if (mergedIdx < 0) continue;

    const ringEdge = wgs84RingEdgeForMergedSegmentIndex(
      b,
      built.segments,
      mergedIdx,
    );
    assert(
      edge.ringEdgeIndex === ringEdge,
      `ringEdgeIndex ${edge.ringEdgeIndex} != WGS84 ${ringEdge} (UTM ${edge.segmentIndex})`,
    );

    const roundTrip = matchMergedSegmentIndexToWgs84RingEdge(
      b,
      built.segments,
      edge.ringEdgeIndex,
    );
    assert(
      roundTrip === mergedIdx,
      `round-trip falhou: WGS84 ${edge.ringEdgeIndex} → UTM merged ${roundTrip} (esperado ${mergedIdx})`,
    );
  }
  console.log('OK testSegmentEdgeWgs84UtmAlignment');
}

/** P2-2 / R-01: clique WGS84 → segment_index UTM para confrontação no mapa. */
function testWgs84EdgeToUtmSegmentIndexForConfrontPick() {
  const b = blockWithGeometry('e1', '01', 50000, 7500000);
  const wgsEdge = 0;
  const utmIdx = utmSegmentIndexFromWgs84RingEdge(b, wgsEdge);
  assert(utmIdx === 0, `WGS84 ${wgsEdge} → UTM ${utmIdx}, esperado 0`);

  const frenteIdxs = officialSegmentIndexesForSide(b, [b], 'frente');
  assert(frenteIdxs.includes(utmIdx), `frente deve incluir ${utmIdx}`);

  const dirIdxs = officialSegmentIndexesForSide(b, [b], 'ladoDireito');
  const esqIdxs = officialSegmentIndexesForSide(b, [b], 'ladoEsquerdo');
  assert(!dirIdxs.includes(wgsEdge) || dirIdxs.includes(utmIdx), 'dir usa UTM');
  assert(dirIdxs.includes(1), 'lado direito UTM 1');
  assert(esqIdxs.includes(3), 'lado esquerdo UTM 3');

  const wgsDir = wgs84RingEdgeForMergedSegmentIndex(
    b,
    buildSideConfrontantsWithSources(b, 'e1', [], [b], []).segments,
    1,
  );
  const utmFromDir = utmSegmentIndexFromWgs84RingEdge(b, wgsDir);
  assert(utmFromDir === 1, `aresta dir WGS84 ${wgsDir} → UTM ${utmFromDir}`);
  assert(dirIdxs.includes(utmFromDir), 'pick lateral mapeia ao lado direito');

  console.log('OK testWgs84EdgeToUtmSegmentIndexForConfrontPick');
}

/**
 * Lote 5 (quadra 123): frente para RUA 02; laterais e fundo confrontam lotes vizinhos.
 * A linha de rua não pode substituir confrontantes em lateral/fundo.
 */
function testLot5StreetOnlyOnFrontNeighborsOnSides() {
  const w = 10;
  const h = 24;
  const baseEast = 50050;
  const baseNorth = 7500025;

  const lot4 = blockWithGeometry('l4', '4', baseEast - w, baseNorth, w, h);
  const lot5 = {
    ...blockWithGeometry('l5', '5', baseEast, baseNorth, w, h),
    block_name: '123',
    front_street_name: 'RUA 02',
    front_street_type: 'rua',
  };
  const lot6 = blockWithGeometry('l6', '6', baseEast + w, baseNorth, w, h);
  const lot7 = blockWithGeometry('l7', '7', baseEast, baseNorth + h, w, h);

  for (const b of [lot4, lot5, lot6, lot7]) {
    b.block_name = '123';
  }

  const streetGuide = {
    id: 'sg-rua-02',
    name: '02',
    type: 'rua',
    active: true,
    geometry: {
      type: 'LineString',
      coordinates: [
        [LNG0 - 30 / M_PER_DEG_LNG, LAT0],
        [LNG0 + 50 / M_PER_DEG_LNG, LAT0],
      ],
    },
  };

  const allBlocks = [lot4, lot5, lot6, lot7];
  const built = buildSideConfrontantsWithSources(
    lot5,
    'l5',
    [],
    allBlocks,
    [streetGuide],
  );

  assert(
    /RUA\s*02/i.test(built.frente),
    `frente deve ser RUA 02, obteve: ${built.frente}`,
  );
  assert(built.sources.frente === 'street_guide', 'frente source street_guide');
  assert(
    /^lote\s*4$/i.test(built.ladoEsquerdo.trim()),
    `esquerdo deve ser Lote 4, obteve: ${built.ladoEsquerdo}`,
  );
  assert(
    /^lote\s*6$/i.test(built.ladoDireito.trim()),
    `direito deve ser Lote 6, obteve: ${built.ladoDireito}`,
  );
  assert(
    /^lote\s*7$/i.test(built.fundo.trim()),
    `fundo deve ser Lote 7, obteve: ${built.fundo}`,
  );
  assert(
    built.sources.ladoEsquerdo === 'neighbor' ||
      built.sources.ladoDireito === 'neighbor' ||
      built.sources.fundo === 'neighbor',
    'laterais/fundo devem vir de vizinho',
  );
  assert(
    built.sources.ladoEsquerdo !== 'street_guide' &&
      built.sources.ladoDireito !== 'street_guide' &&
      built.sources.fundo !== 'street_guide',
    'rua não pode ser source de lateral/fundo',
  );

  const audit = buildLotConfrontationAudit(lot5, 'l5', allBlocks, [streetGuide]);
  assert(/RUA\s*02/i.test(audit.sides.frente.label), 'auditoria frente RUA 02');
  assert(
    /^lote\s*4$/i.test(audit.sides.ladoEsquerdo.label.trim()),
    `auditoria esq: ${audit.sides.ladoEsquerdo.label}`,
  );
  assert(
    /^lote\s*6$/i.test(audit.sides.ladoDireito.label.trim()),
    `auditoria dir: ${audit.sides.ladoDireito.label}`,
  );
  assert(
    /^lote\s*7$/i.test(audit.sides.fundo.label.trim()),
    `auditoria fundo: ${audit.sides.fundo.label}`,
  );

  for (const edge of audit.segmentEdges) {
    const role =
      audit.sides.frente.segmentIndexes.includes(
        built.segments.findIndex((s) => s.originalIndex === edge.segmentIndex),
      )
        ? 'frente'
        : audit.sides.fundo.segmentIndexes.includes(
              built.segments.findIndex(
                (s) => s.originalIndex === edge.segmentIndex,
              ),
            )
          ? 'fundo'
          : audit.sides.ladoDireito.segmentIndexes.includes(
                built.segments.findIndex(
                  (s) => s.originalIndex === edge.segmentIndex,
                ),
              )
            ? 'ladoDireito'
            : audit.sides.ladoEsquerdo.segmentIndexes.includes(
                  built.segments.findIndex(
                    (s) => s.originalIndex === edge.segmentIndex,
                  ),
                )
              ? 'ladoEsquerdo'
              : null;
    if (role && role !== 'frente' && edge.confrontant) {
      assert(
        !/RUA\s*02/i.test(edge.confrontant),
        `segmento ${edge.segmentIndex} (${role}) não pode ser rua: ${edge.confrontant}`,
      );
    }
  }

  console.log('OK testLot5StreetOnlyOnFrontNeighborsOnSides');
}

/** 1. Manual vence lote vizinho automático. */
function testManualBeatsNeighborAuto() {
  const w = 10;
  const h = 24;
  const baseEast = 50050;
  const baseNorth = 7500025;
  const lot5 = {
    ...blockWithGeometry('l5', '5', baseEast, baseNorth, w, h),
    block_name: '123',
    front_street_name: 'RUA 02',
  };
  const lot6 = blockWithGeometry('l6', '6', baseEast + w, baseNorth, w, h);
  lot5.block_name = '123';
  lot6.block_name = '123';
  const allBlocks = [lot5, lot6];
  const auto = buildSideConfrontantsWithSources(lot5, 'l5', [], allBlocks, []);
  assert(/^lote\s*6$/i.test(auto.ladoDireito.trim()), 'vizinho auto Lote 6');

  const manual = applyManualConfrontantToBlock(lot5, [1], 'Lote 99', 'lot');
  const built = buildSideConfrontantsWithSources(manual, 'l5', [], allBlocks, []);
  assert(built.ladoDireito === 'Lote 99', `manual vence vizinho: ${built.ladoDireito}`);
  console.log('OK testManualBeatsNeighborAuto');
}

/** 2. Manual vence rua. */
function testManualBeatsStreet() {
  const b = block('a', '01', 50000, 7500000);
  const withStreet = applyAutoFrontStreetToBlockSegments(
    b,
    'RUA CENTRAL 01',
    'street_guide',
    [b],
  );
  const recStreet = getSegmentConfrontantRecord(withStreet, 0);
  assert(recStreet?.confrontant_source === 'street_guide', 'frente com rua');

  const manual = applyManualConfrontantToBlock(withStreet, [0], 'RUA PARALELA', 'street');
  const built = buildSideConfrontantsWithSources(manual, 'a', [], [manual], []);
  assert(built.frente === 'RUA PARALELA', `manual vence rua: ${built.frente}`);
  assert(built.sources.frente === 'manual', 'source manual');
  console.log('OK testManualBeatsStreet');
}

/** 3. Confrontação automática não apaga manual. */
function testAutoStreetDoesNotWipeManual() {
  const b = block('b', '02', 50010, 7500000);
  let manual = applyManualConfrontantToBlock(b, [2], 'Área Verde', 'green_area');
  const afterAuto = applyAutoFrontStreetToBlockSegments(
    manual,
    'RUA NOVA',
    'street_guide',
    [manual],
  );
  const recManual = getSegmentConfrontantRecord(afterAuto, 2);
  assert(recManual?.confrontant === 'Área Verde', 'manual no seg 2 intacto');
  assert(recManual?.confrontant_source === 'manual', 'source manual intacto');
  console.log('OK testAutoStreetDoesNotWipeManual');
}

/** 4. Memorial usa confrontante manual. */
function testMemorialUsesManual() {
  const b = block('m', '03', 50030, 7500000);
  const updated = applyManualConfrontantToBlock(b, [1], 'Lote 12', 'lot');
  const c = resolveMemorialSegmentConfrontant(
    updated,
    1,
    'lado_direito',
    null,
    [],
    [updated],
  );
  assert(c.label === 'Lote 12', c.label);
  assert(c.source === 'manual', c.source);
  console.log('OK testMemorialUsesManual');
}

/** 5. Prancha usa confrontante manual. */
function testPranchaUsesManual() {
  const b = block('p', '04', 50040, 7500000);
  const updated = applyManualConfrontantToBlock(b, [2], 'APP', 'app');
  const audit = buildLotConfrontationAudit(updated, 'p', [updated], []);
  const sheet = confrontantsFromAudit(audit);
  assert(
    sheet.fundo === 'APP' || sheet.ladoDireito === 'APP' || sheet.ladoEsquerdo === 'APP',
    `prancha: ${sheet.fundo}/${sheet.ladoDireito}/${sheet.ladoEsquerdo}`,
  );
  const edge = audit.segmentEdges.find((e) => e.segmentIndex === 2);
  assert(edge?.status === 'manual', 'auditoria status manual');
  console.log('OK testPranchaUsesManual');
}

/** 6. Popup/auditoria exibe origem manual. */
function testAuditShowsManualOrigin() {
  const b = block('o', '05', 50050, 7500000);
  const updated = applyManualConfrontantToBlock(b, [3], 'Lote 08', 'lot');
  const audit = buildLotConfrontationAudit(updated, 'o', [updated], []);
  const edge = audit.segmentEdges.find((e) => e.segmentIndex === 3);
  assert(edge?.source === 'manual', 'origem manual no segmentEdge');
  assert(edge?.status === 'manual', 'status manual');
  assert(edge?.confrontant === 'Lote 08', edge?.confrontant ?? '');
  console.log('OK testAuditShowsManualOrigin');
}

/** 7. Limpar manual volta para automático. */
function testClearManualRevertsToAuto() {
  const w = 10;
  const h = 24;
  const baseEast = 50060;
  const baseNorth = 7500025;
  const lot5 = {
    ...blockWithGeometry('l5b', '5', baseEast, baseNorth, w, h),
    block_name: '123',
  };
  const lot6 = blockWithGeometry('l6b', '6', baseEast + w, baseNorth, w, h);
  lot5.block_name = '123';
  lot6.block_name = '123';
  const allBlocks = [lot5, lot6];
  let manual = applyManualConfrontantToBlock(lot5, [1], 'Lote 99', 'lot');
  assert(
    buildSideConfrontantsWithSources(manual, 'l5b', [], allBlocks, []).ladoDireito ===
      'Lote 99',
    'manual ativo',
  );
  const cleared = clearManualConfrontantFromBlock(manual, [1]);
  const rec = getSegmentConfrontantRecord(cleared, 1);
  assert(!rec || rec.confrontant_source !== 'manual', 'manual removido');
  const rebuilt = buildSideConfrontantsWithSources(cleared, 'l5b', [], allBlocks, []);
  assert(/^lote\s*6$/i.test(rebuilt.ladoDireito.trim()), `voltou vizinho: ${rebuilt.ladoDireito}`);
  console.log('OK testClearManualRevertsToAuto');
}

/** 8. Histórico registra confrontation_manual. */
function testAuditLogConfrontationManual() {
  const payload = buildLotAuditPayload({
    blockId: 'lot-1',
    action: 'confrontation_manual',
    title: 'Confrontação manual alterada',
    description: 'Segmento 3 alterado para Lote 07',
    oldData: { segments: [{ segment_index: 2, confrontant: 'Lote 06' }] },
    newData: { segment_indexes: [2], confrontant: 'Lote 07' },
    source: 'gis_map',
  });
  assert(payload.action === 'confrontation_manual', 'action');
  assert(payload.title === 'Confrontação manual alterada', 'title');
  assert(
    (payload.old_data as Record<string, unknown>)?.segments != null,
    'old_data segments',
  );
  const cleared = buildLotAuditPayload({
    blockId: 'lot-1',
    action: 'confrontation_manual',
    title: 'Confrontação manual removida',
    source: 'gis_map',
  });
  assert(cleared.title === 'Confrontação manual removida', 'clear title');
  console.log('OK testAuditLogConfrontationManual');
}

/** 9. Lado com múltiplos segmentos permite confrontantes diferentes. */
function testMultiSegmentDifferentManual() {
  const segments = [
    ...utmRectSegments(50070, 7500000, 12, 25),
    {
      segment_index: 4,
      north: 7500025,
      east: 50082,
      end_north: 7500025,
      end_east: 50088,
      distance: 6,
      segment_type: 'LINE',
    },
  ];
  const b = {
    ...block('multi', '10', 50070, 7500000),
    segments_json: segments,
  };
  let updated = applyManualConfrontantToBlock(b, [0], 'RUA A', 'street');
  updated = applyManualConfrontantToBlock(updated, [4], 'Lote 15', 'lot');
  const r0 = getSegmentConfrontantRecord(updated, 0);
  const r4 = getSegmentConfrontantRecord(updated, 4);
  assert(r0?.confrontant === 'RUA A', 'seg 0 RUA A');
  assert(r4?.confrontant === 'Lote 15', 'seg 4 Lote 15');
  const rows = clearManualConfrontantFromSegmentRows(updated, [0]);
  const onlySeg4 = getSegmentConfrontantRecord({ ...updated, segments_json: rows }, 4);
  assert(onlySeg4?.confrontant === 'Lote 15', 'seg 4 preservado ao limpar seg 0');
  console.log('OK testMultiSegmentDifferentManual');
}

testPendingLabel();
testManualOverridesAuto();
testAuditPendingFundo();
testManualNotClearedByRebuild();
testSegmentEdgeWgs84UtmAlignment();
testWgs84EdgeToUtmSegmentIndexForConfrontPick();
testLot5StreetOnlyOnFrontNeighborsOnSides();
testManualBeatsNeighborAuto();
testManualBeatsStreet();
testAutoStreetDoesNotWipeManual();
testMemorialUsesManual();
testPranchaUsesManual();
testAuditShowsManualOrigin();
testClearManualRevertsToAuto();
testAuditLogConfrontationManual();
testMultiSegmentDifferentManual();
console.log('mandatory-assisted-confrontation-tests: all passed');
