/**
 * GIS-004 — vinculação frente ↔ street_guides
 * npx tsx scripts/mandatory-front-street-name-tests.ts
 */

import { buildSideConfrontantsFromSegments } from '../lib/lotSegmentConfrontation';
import { getOfficialConfrontationRing } from '../lib/officialConfrontationRing';
import {
  isUnknownColumnError,
} from '../lib/blockFrontPersist';
import {
  detectFrontEdgeIndexFromGuides,
  lngLatEdgeAtRingIndex,
  resolveFrontStreetGuideForLot,
  resolveLotFrontStreetDisplay,
  resolveFrenteConfrontantLabel,
} from '../lib/resolveFrontStreetGuide';
import { flattenLineStringCoordinates } from '../lib/streetGuideConfrontation';
import { scoreSegmentStreetProximity } from '../lib/lotStreetFrontDetection';
import {
  buildStreetGuideInsertPayload,
  emptyStreetGuideForm,
  normalizeStreetGuideLineCoordinates,
  readStreetGuideLineCoordinates,
  streetGuideLineEndpoints,
} from '../lib/streetGuide';

const BASE_EAST = 50000;
const BASE_NORTH = 7500000;
const LAT0 = -23.5;
const LNG0 = -46.6;
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LNG = 111320 * Math.cos((LAT0 * Math.PI) / 180);

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function utmRectSegments(
  east0: number,
  north0: number,
  widthM: number,
  depthM: number,
): Record<string, unknown>[] {
  const e1 = east0 + widthM;
  const n1 = north0 + depthM;
  return [
    {
      segment_index: 0,
      north: north0,
      east: east0,
      end_north: north0,
      end_east: e1,
      distance: widthM,
      segment_type: 'LINE',
    },
    {
      segment_index: 1,
      north: north0,
      east: e1,
      end_north: n1,
      end_east: e1,
      distance: depthM,
      segment_type: 'LINE',
    },
    {
      segment_index: 2,
      north: n1,
      east: e1,
      end_north: n1,
      end_east: east0,
      distance: widthM,
      segment_type: 'LINE',
    },
    {
      segment_index: 3,
      north: n1,
      east: east0,
      end_north: north0,
      end_east: east0,
      distance: depthM,
      segment_type: 'LINE',
    },
  ];
}

function toLngLat(east: number, north: number): [number, number] {
  return [LNG0 + east / M_PER_DEG_LNG, LAT0 + north / M_PER_DEG_LAT];
}

function guideAlongEdge(
  id: string,
  name: string,
  east0: number,
  north0: number,
  east1: number,
  north1: number,
  offsetNorthM: number,
) {
  const a = toLngLat(
    east0 - BASE_EAST,
    north0 - BASE_NORTH + offsetNorthM,
  );
  const b = toLngLat(
    east1 - BASE_EAST,
    north1 - BASE_NORTH + offsetNorthM,
  );
  return {
    id,
    name,
    type: 'Rua',
    active: true,
    geometry: { type: 'LineString', coordinates: [a, b] },
  };
}

function rectRing(
  x0: number,
  y0: number,
  w: number,
  h: number,
): [number, number][] {
  const toLat = (x: number, y: number): [number, number] => [
    LAT0 + y / M_PER_DEG_LAT,
    LNG0 + x / M_PER_DEG_LNG,
  ];
  return [
    toLat(x0, y0),
    toLat(x0 + w, y0),
    toLat(x0 + w, y0 + h),
    toLat(x0, y0 + h),
  ];
}

function lotBlock(
  num: string,
  frontIdx: number,
  east0: number,
  north0: number,
): Record<string, unknown> {
  const w = 12;
  const h = 25;
  const ring = rectRing(east0 - BASE_EAST, north0 - BASE_NORTH, w, h);
  const coords = ring.map(([lat, lng]) => [lng, lat]);
  return {
    id: `lot-${num}`,
    number: num,
    block_name: '02',
    front_segment_index: frontIdx,
    segments_json: utmRectSegments(east0, north0, w, h),
    bounds: ring,
    geometry: { type: 'Polygon', coordinates: [coords] },
  };
}

function testCentral01OnLot01() {
  const east0 = BASE_EAST;
  const north0 = BASE_NORTH;
  const block = lotBlock('01', 0, east0, north0);
  const guides = [
    guideAlongEdge('g01', 'CENTRAL 01', east0, north0, east0 + 12, north0, -0.25),
  ];
  const match = resolveFrontStreetGuideForLot(block, guides);
  assert(match != null, 'lote 01 deve achar guia');
  assert(
    /CENTRAL\s*01/i.test(match!.streetGuideName),
    `esperado RUA CENTRAL 01, obteve ${match!.streetGuideName}`,
  );
  console.log('OK testCentral01OnLot01');
}

function testCentral02OnLot23() {
  const east0 = BASE_EAST + 50;
  const north0 = BASE_NORTH;
  const block = lotBlock('23', 1, east0, north0);
  const guides = [
    guideAlongEdge(
      'g02',
      'CENTRAL 02',
      east0 + 12,
      north0,
      east0 + 12,
      north0 + 25,
      -0.25,
    ),
  ];
  const match = resolveFrontStreetGuideForLot(block, guides);
  assert(match != null, 'lote 23 deve achar guia');
  assert(
    /CENTRAL\s*02/i.test(match!.streetGuideName),
    `esperado RUA CENTRAL 02, obteve ${match!.streetGuideName}`,
  );
  console.log('OK testCentral02OnLot23');
}

function testNoGuideReturnsNull() {
  const block = lotBlock('99', 0, BASE_EAST + 200, BASE_NORTH + 200);
  const match = resolveFrontStreetGuideForLot(block, []);
  assert(match === null, 'sem guias → null');
  console.log('OK testNoGuideReturnsNull');
}

function testPopupPrefersSavedName() {
  const block = {
    ...lotBlock('01', 0, BASE_EAST, BASE_NORTH),
    front_street_name: 'RUA CENTRAL 01',
    front_street_type: 'Rua',
  };
  const display = resolveLotFrontStreetDisplay(block, []);
  assert(display != null && /CENTRAL\s*01/i.test(display), 'popup usa nome salvo');
  console.log('OK testPopupPrefersSavedName');
}

function testConfrontationUsesSavedFrontStreet() {
  const block = {
    ...lotBlock('12', 1, BASE_EAST, BASE_NORTH),
    front_street_name: 'RUA CENTRAL 02',
    front_street_type: 'Rua',
  };
  const official = getOfficialConfrontationRing(block);
  assert(official.ok, 'anel oficial');
  const got = buildSideConfrontantsFromSegments(
    block,
    String(block.id),
    official.ring,
    [block],
    [],
  );
  assert(
    /CENTRAL\s*02/i.test(got.frente),
    `confrontação frente deve usar salvo, obteve ${got.frente}`,
  );
  console.log('OK testConfrontationUsesSavedFrontStreet');
}

function testSchemaFallbackDetectsMissingColumn() {
  assert(
    isUnknownColumnError(
      { code: 'PGRST204', message: 'Could not find front_street_name column' },
      'front_street_name',
    ),
    'detecta PGRST204 front_street_name',
  );
  console.log('OK testSchemaFallbackDetectsMissingColumn');
}

function testFrenteLabelFromProximity() {
  const east0 = BASE_EAST;
  const north0 = BASE_NORTH;
  const block = lotBlock('34', 0, east0, north0);
  const guides = [
    guideAlongEdge('g01', 'CENTRAL 01', east0, north0, east0 + 12, north0, -0.25),
  ];
  const label = resolveFrenteConfrontantLabel(block, [0], [], guides);
  assert(/CENTRAL\s*01/i.test(label), `frente por proximidade: ${label}`);
  console.log('OK testFrenteLabelFromProximity');
}

/** Polilinha com 4 vértices ao longo da frente sul do lote (vértices intermediários). */
function multiPointGuideAlongSouth(
  id: string,
  name: string,
  east0: number,
  north0: number,
  widthM: number,
  offsetNorthM: number,
) {
  const relEast = east0 - BASE_EAST;
  const relNorth = north0 - BASE_NORTH + offsetNorthM;
  const coords = [
    toLngLat(relEast - 2, relNorth),
    toLngLat(relEast + widthM * 0.33, relNorth),
    toLngLat(relEast + widthM * 0.66, relNorth),
    toLngLat(relEast + widthM + 2, relNorth),
  ];
  return {
    id,
    name,
    type: 'Rua',
    active: true,
    geometry: { type: 'LineString', coordinates: coords },
  };
}

function testMultiPointStreetGuidePayloadAndRead() {
  const coords = [
    toLngLat(0, -0.25),
    toLngLat(6, -0.25),
    toLngLat(12, -0.25),
    toLngLat(12, 12 - 0.25),
  ];
  const normalized = normalizeStreetGuideLineCoordinates(coords);
  assert(normalized != null && normalized.length === 4, 'normaliza 4 vértices');
  const flat = flattenLineStringCoordinates(coords);
  assert(flat != null && flat.length === 4, 'flatten mantém 4 vértices');
  const endpoints = streetGuideLineEndpoints(coords);
  assert(endpoints != null, 'endpoints existem');
  assert(
    Math.abs(endpoints!.start[0] - coords[0][0]) < 1e-9,
    'start = primeiro vértice',
  );
  assert(
    Math.abs(endpoints!.end[0] - coords[3][0]) < 1e-9,
    'end = último vértice',
  );
  const payload = buildStreetGuideInsertPayload({
    tenantId: 't1',
    projectId: 'p1',
    form: emptyStreetGuideForm(),
    coordinates: coords,
  });
  const saved = (payload.geometry_geojson as { coordinates: number[][] })
    .coordinates;
  assert(saved.length === 4, 'payload salva 4 coordenadas');
  const readBack = readStreetGuideLineCoordinates(payload);
  assert(readBack != null && readBack.length === 4, 'leitura retorna polilinha');
  console.log('OK testMultiPointStreetGuidePayloadAndRead');
}

function testMultiPointStreetGuideFrontOnMiddleSegment() {
  const east0 = BASE_EAST;
  const north0 = BASE_NORTH;
  const widthM = 12;
  const block = lotBlock('41', 0, east0, north0);
  const guides = [
    multiPointGuideAlongSouth(
      'g-poly',
      'POLIGONAL CENTRAL',
      east0,
      north0,
      widthM,
      -0.25,
    ),
  ];
  const detected = detectFrontEdgeIndexFromGuides(block, guides, 1.0);
  assert(detected != null, 'detecção deve achar aresta próxima à polilinha');
  assert(detected!.edgeIndex === 0, 'frente sul (índice 0) deve ser detectada');
  const match = resolveFrontStreetGuideForLot(block, guides);
  assert(match != null, 'lote deve achar guia polilinha');
  assert(
    /POLIGONAL/i.test(match!.streetGuideName),
    `esperado POLIGONAL CENTRAL, obteve ${match!.streetGuideName}`,
  );
  const edge = lngLatEdgeAtRingIndex(block, 0);
  assert(edge != null, 'aresta sul do lote');
  const guideCoords = guides[0].geometry.coordinates;
  const score = scoreSegmentStreetProximity(
    edge!.p1,
    edge!.p2,
    guideCoords,
  );
  assert(
    score.minDistM < 1.0,
    `frente deve usar segmentos intermediários da polilinha (${score.minDistM}m)`,
  );
  assert(guideCoords.length >= 4, 'guia com 4+ vértices');
  console.log('OK testMultiPointStreetGuideFrontOnMiddleSegment');
}

function testLegacyTwoPointGuideStillWorks() {
  const east0 = BASE_EAST;
  const north0 = BASE_NORTH;
  const legacy = guideAlongEdge(
    'g-legacy',
    'CENTRAL 01',
    east0,
    north0,
    east0 + 12,
    north0,
    -0.25,
  );
  const coords = readStreetGuideLineCoordinates(legacy);
  assert(coords != null && coords.length === 2, 'rua antiga com 2 pontos');
  const block = lotBlock('01', 0, east0, north0);
  const match = resolveFrontStreetGuideForLot(block, [legacy]);
  assert(match != null, 'compatibilidade ruas antigas');
  console.log('OK testLegacyTwoPointGuideStillWorks');
}

testCentral01OnLot01();
testCentral02OnLot23();
testNoGuideReturnsNull();
testPopupPrefersSavedName();
testConfrontationUsesSavedFrontStreet();
testSchemaFallbackDetectsMissingColumn();
testFrenteLabelFromProximity();
testMultiPointStreetGuidePayloadAndRead();
testMultiPointStreetGuideFrontOnMiddleSegment();
testLegacyTwoPointGuideStillWorks();
console.log('mandatory-front-street-name-tests: all passed');
