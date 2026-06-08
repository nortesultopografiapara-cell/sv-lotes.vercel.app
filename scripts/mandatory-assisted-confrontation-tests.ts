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
  officialSegmentIndexesForSide,
} from '../lib/assistedConfrontation';
import {
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

function blockWithGeometry(id: string, num: string, east: number, north: number) {
  const w = 12;
  const h = 25;
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

testPendingLabel();
testManualOverridesAuto();
testAuditPendingFundo();
testManualNotClearedByRebuild();
testSegmentEdgeWgs84UtmAlignment();
testWgs84EdgeToUtmSegmentIndexForConfrontPick();
console.log('mandatory-assisted-confrontation-tests: all passed');
