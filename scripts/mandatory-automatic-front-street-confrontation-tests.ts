/**
 * GIS-006B — confrontação automática: frente ↔ street_guide nomeada
 * npx tsx scripts/mandatory-automatic-front-street-confrontation-tests.ts
 */

import { buildLotConfrontationAudit } from '../lib/assistedConfrontation';
import { applyAutoFrontStreetToBlockSegments } from '../lib/autoFrontStreetSegments';
import { buildSideConfrontantsWithSources } from '../lib/lotSegmentConfrontation';
import {
  resolveFrontStreetGuideForLot,
  resolveLotFrontStreetDisplay,
} from '../lib/resolveFrontStreetGuide';
import {
  getSegmentConfrontantRecord,
} from '../lib/segmentConfrontantPersist';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const LAT0 = -23.5;
const LNG0 = -46.6;
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LNG = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const BASE_EAST = 50000;
const BASE_NORTH = 7500000;

function toLngLat(localEast: number, localNorth: number): [number, number] {
  return [LNG0 + localEast / M_PER_DEG_LNG, LAT0 + localNorth / M_PER_DEG_LAT];
}

function utmRectSegments(w: number, h: number): Record<string, unknown>[] {
  const e1 = BASE_EAST + w;
  const n1 = BASE_NORTH + h;
  return [
    {
      segment_index: 0,
      north: BASE_NORTH,
      east: BASE_EAST,
      end_north: BASE_NORTH,
      end_east: e1,
      distance: w,
      segment_type: 'LINE',
    },
    {
      segment_index: 1,
      north: BASE_NORTH,
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
      end_east: BASE_EAST,
      distance: w,
      segment_type: 'LINE',
    },
    {
      segment_index: 3,
      north: n1,
      east: BASE_EAST,
      end_north: BASE_NORTH,
      end_east: BASE_EAST,
      distance: h,
      segment_type: 'LINE',
    },
  ];
}

function rectBounds(w: number, h: number): [number, number][] {
  return [
    [LAT0, LNG0],
    [LAT0, LNG0 + w / M_PER_DEG_LNG],
    [LAT0 + h / M_PER_DEG_LAT, LNG0 + w / M_PER_DEG_LNG],
    [LAT0 + h / M_PER_DEG_LAT, LNG0],
  ];
}

function guideAlongSouth(name: string, w: number, offsetM: number) {
  const a = toLngLat(0, -offsetM);
  const b = toLngLat(w, -offsetM);
  return {
    id: `g-${name}`,
    name,
    type: 'Rua',
    active: true,
    geometry: { type: 'LineString', coordinates: [a, b] },
  };
}

function guideAlongEast(name: string, w: number, h: number, offsetM: number) {
  const a = toLngLat(w + offsetM, 0);
  const b = toLngLat(w + offsetM, h);
  return {
    id: `g-${name}`,
    name,
    type: 'Rua',
    active: true,
    geometry: { type: 'LineString', coordinates: [a, b] },
  };
}

function lotBlock(
  num: string,
  frontIdx: number,
  w = 12,
  h = 25,
  extra: Record<string, unknown> = {},
) {
  const bounds = rectBounds(w, h);
  const coords = bounds.map(([lat, lng]) => [lng, lat]);
  return {
    id: `lot-${num}`,
    number: num,
    block_name: '02',
    front_segment_index: frontIdx,
    bounds,
    geometry: { type: 'Polygon', coordinates: [coords] },
    segments_json: utmRectSegments(w, h),
    ...extra,
  };
}

function testInterna01OnFront() {
  const block = lotBlock('01', 0);
  const guides = [guideAlongSouth('INTERNA 01', 12, 0.5)];
  const built = buildSideConfrontantsWithSources(
    block,
    block.id as string,
    [],
    [block],
    guides,
  );
  assert(/INTERNA\s*01/i.test(built.frente), built.frente);
  assert(built.sources.frente === 'street_guide', built.sources.frente);
  assert(!built.pending.frente, 'frente não pendente');
  console.log('OK testInterna01OnFront');
}

function testInterna02OnFront() {
  const block = lotBlock('23', 1, 12, 25);
  const guides = [guideAlongEast('INTERNA 02', 12, 25, 0.5)];
  const built = buildSideConfrontantsWithSources(
    block,
    block.id as string,
    [],
    [block],
    guides,
  );
  assert(/INTERNA\s*02/i.test(built.frente), built.frente);
  assert(built.sources.frente === 'street_guide', built.sources.frente);
  console.log('OK testInterna02OnFront');
}

function testSavedNamePriority() {
  const block = lotBlock('99', 0, 12, 25, {
    front_street_name: 'RUA SALVA NO BANCO',
    front_street_type: 'Rua',
  });
  const guides = [guideAlongSouth('INTERNA 02', 12, 0.2)];
  const built = buildSideConfrontantsWithSources(
    block,
    block.id as string,
    [],
    [block],
    guides,
  );
  assert(/SALVA/i.test(built.frente), built.frente);
  assert(built.sources.frente === 'street_guide', built.sources.frente);
  console.log('OK testSavedNamePriority');
}

function testNoStreetPending() {
  const block = lotBlock('77', 0);
  const built = buildSideConfrontantsWithSources(
    block,
    block.id as string,
    [],
    [block],
    [],
  );
  assert(built.pending.frente, 'sem rua → pendente');
  assert(built.sources.frente === 'undefined', built.sources.frente);
  console.log('OK testNoStreetPending');
}

function testAuditGreenNotPending() {
  const block = lotBlock('34', 0);
  const guides = [guideAlongSouth('INTERNA 01', 12, 0.6)];
  const audit = buildLotConfrontationAudit(
    block,
    block.id as string,
    [block],
    guides,
  );
  assert(/INTERNA\s*01/i.test(audit.sides.frente.label), audit.sides.frente.label);
  assert(audit.sides.frente.source === 'street_guide', audit.sides.frente.source);
  assert(!audit.sides.frente.pending, 'auditoria frente resolvida');
  const resolvedFront = audit.segmentEdges.some(
    (e) => e.status === 'resolved' && /INTERNA/i.test(e.confrontant ?? ''),
  );
  assert(resolvedFront, 'aresta da frente com status resolved');
  console.log('OK testAuditGreenNotPending');
}

function testAutoSegmentsJson() {
  const block = lotBlock('01', 0);
  const guides = [guideAlongSouth('INTERNA 01', 12, 0.4)];
  const match = resolveFrontStreetGuideForLot(block, guides);
  assert(match != null, 'guia');
  const built = buildSideConfrontantsWithSources(
    block,
    block.id as string,
    [],
    [block],
    guides,
  );
  const updated = applyAutoFrontStreetToBlockSegments(
    block,
    built.frente,
    'street_guide',
    [block],
  );
  const rec = getSegmentConfrontantRecord(updated, 0);
  assert(rec?.confrontant_source === 'street_guide', rec?.confrontant_source);
  assert(/INTERNA\s*01/i.test(rec?.confrontant ?? ''), rec?.confrontant);
  assert(rec?.confrontant_type === 'street', String(rec?.confrontant_type));
  console.log('OK testAutoSegmentsJson');
}

function testWgsMismatchStillResolves() {
  const block = lotBlock('01', 0);
  const guides = [guideAlongSouth('INTERNA 01', 12, 0.5)];
  const display = resolveLotFrontStreetDisplay(block, guides);
  assert(display != null && /INTERNA/i.test(display), display ?? '');
  console.log('OK testWgsMismatchStillResolves');
}

testInterna01OnFront();
testInterna02OnFront();
testSavedNamePriority();
testNoStreetPending();
testAuditGreenNotPending();
testAutoSegmentsJson();
testWgsMismatchStillResolves();
console.log('mandatory-automatic-front-street-confrontation-tests: all passed');
