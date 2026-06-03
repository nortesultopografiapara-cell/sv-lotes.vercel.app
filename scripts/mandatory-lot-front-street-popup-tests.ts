/**
 * GIS-006A — frente do lote ↔ street_guide no popup (anel WGS84)
 * npx tsx scripts/mandatory-lot-front-street-popup-tests.ts
 */

import {
  lngLatEdgeAtRingIndex,
  resolveFrontStreetGuideForLot,
  resolveLotFrontStreetDisplay,
  STREET_GUIDE_LOT_FRONT_TOLERANCE_M,
} from '../lib/resolveFrontStreetGuide';
import { STREET_GUIDE_CONFRONT_TOLERANCE_M } from '../lib/streetGuideConfrontation';
import { buildSideConfrontantsWithSources } from '../lib/lotSegmentConfrontation';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const LAT0 = -23.5;
const LNG0 = -46.6;
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LNG = 111320 * Math.cos((LAT0 * Math.PI) / 180);

function toLngLat(localEast: number, localNorth: number): [number, number] {
  return [LNG0 + localEast / M_PER_DEG_LNG, LAT0 + localNorth / M_PER_DEG_LAT];
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

function lotBlock(num: string, frontIdx: number, w = 12, h = 25) {
  const bounds = rectBounds(w, h);
  const coords = bounds.map(([lat, lng]) => [lng, lat]);
  return {
    id: `lot-${num}`,
    number: num,
    block_name: '02',
    front_segment_index: frontIdx,
    bounds,
    geometry: { type: 'Polygon', coordinates: [coords] },
    segments_json: [],
  };
}

function testToleranceConstants() {
  assert(STREET_GUIDE_LOT_FRONT_TOLERANCE_M === 1.0, 'popup tolerance 1m');
  assert(STREET_GUIDE_CONFRONT_TOLERANCE_M === 0.35, 'auto confront 0.35m');
  console.log('OK testToleranceConstants');
}

function testWgs84EdgeNotUtmIndex() {
  const block = lotBlock('01', 0);
  const guides = [guideAlongSouth('INTERNA 01', 12, 0.4)];
  const edge = lngLatEdgeAtRingIndex(block, 0);
  assert(edge != null, 'aresta 0 no anel WGS84');
  const match = resolveFrontStreetGuideForLot(block, guides);
  assert(match != null, 'deve achar guia pela aresta WGS84');
  assert(/INTERNA\s*01/i.test(match!.streetGuideName), match!.streetGuideName);
  const display = resolveLotFrontStreetDisplay(block, guides);
  assert(display != null && /INTERNA\s*01/i.test(display), display ?? '');
  console.log('OK testWgs84EdgeNotUtmIndex (lote 01)');
}

function guideAlongEast(
  name: string,
  w: number,
  h: number,
  offsetM: number,
) {
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

function testLot23SecondStreet() {
  const w = 12;
  const h = 25;
  const block = lotBlock('23', 1, w, h);
  const guides = [guideAlongEast('INTERNA 02', w, h, 0.5)];
  const match = resolveFrontStreetGuideForLot(block, guides);
  assert(
    match != null && /INTERNA\s*02/i.test(match!.streetGuideName),
    String(match?.streetGuideName),
  );
  const display = resolveLotFrontStreetDisplay(block, guides);
  assert(display != null && /INTERNA\s*02/i.test(display), display ?? '');
  console.log('OK testLot23SecondStreet');
}

function testLot34() {
  const block = lotBlock('34', 0);
  const guides = [guideAlongSouth('INTERNA 01', 12, 0.6)];
  const built = buildSideConfrontantsWithSources(
    block,
    block.id as string,
    [],
    [block],
    guides,
  );
  assert(/INTERNA\s*01/i.test(built.frente), `frente confrontação: ${built.frente}`);
  assert(!built.pending.frente, 'frente não deve ficar pendente');
  console.log('OK testLot34');
}

function testSavedNamePriority() {
  const block = {
    ...lotBlock('99', 0),
    front_street_name: 'RUA SALVA NO BANCO',
    front_street_type: 'Rua',
  };
  const guides = [guideAlongSouth('INTERNA 02', 12, 0.2)];
  const display = resolveLotFrontStreetDisplay(block, guides);
  assert(display?.includes('SALVA'), display ?? '');
  console.log('OK testSavedNamePriority');
}

testToleranceConstants();
testWgs84EdgeNotUtmIndex();
testLot23SecondStreet();
testLot34();
testSavedNamePriority();
console.log('mandatory-lot-front-street-popup-tests: all passed');
