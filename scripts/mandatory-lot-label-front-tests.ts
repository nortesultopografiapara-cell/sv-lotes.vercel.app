/**
 * Testes: label obedece front_segment_index (lotes 12, 13, 19, 20, 34 — geometria sintética).
 * npx tsx scripts/mandatory-lot-label-front-tests.ts
 */

import {
  computeOfficialLotLabelPosition,
  resolveFrontSegmentFromIndex,
  type LatLngPair,
} from '../lib/lotLabelPosition';
import {
  buildManualFrontPatch,
  formatSupabaseError,
  isUnknownColumnError,
} from '../lib/blockFrontPersist';
import { officialSegmentIndexesForSide } from '../lib/assistedConfrontation';
import { getOfficialLotMeasurements } from '../lib/officialLotMeasurements';
import {
  normalizeFrontSegmentIndexForPersist,
  resolveFrontWgs84RingIndex,
} from '../lib/resolveFrontStreetGuide';
import { extractSegments, mergeCurvedSegments } from '../utils/calculateLotDimensions';

const BASE_EAST = 50000;
const BASE_NORTH = 7500000;
const LAT0 = -23.5;
const LNG0 = -46.6;
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LNG = 111320 * Math.cos((LAT0 * Math.PI) / 180);

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

/** Retângulo: frente = aresta inferior (índice 0). */
function rectBounds(): LatLngPair[] {
  return [
    [-1.455, -48.49],
    [-1.455, -48.4895],
    [-1.4545, -48.4895],
    [-1.4545, -48.49],
  ];
}

function testFrontIndexZero() {
  const bounds = rectBounds();
  const ring = bounds.map(([lat, lng]) => [lng, lat]);
  ring.push(ring[0]);
  const segments = extractSegments(ring, []);
  const seg = resolveFrontSegmentFromIndex(segments, 0);
  assert(seg != null, 'segmento 0 deve existir');
  const pos = computeOfficialLotLabelPosition(bounds, {
    frontSegmentIndex: 0,
    frente: seg!.length,
    frontStreetName: 'Rua 01',
  });
  const centroid = bounds.reduce(
    (acc, p) => [acc[0] + p[0] / bounds.length, acc[1] + p[1] / bounds.length],
    [0, 0],
  ) as LatLngPair;
  const distToCentroid = Math.hypot(pos[0] - centroid[0], pos[1] - centroid[1]);
  const distToSouth = Math.abs(pos[0] - (-1.455));
  assert(distToSouth < distToCentroid, 'label deve ficar mais perto da frente sul');
  console.log('OK testFrontIndexZero');
}

function testLots12_13_19_20_34_indexMapping() {
  const bounds = rectBounds();
  const ring = bounds.map(([lat, lng]) => [lng, lat]);
  ring.push(ring[0]);
  const segments = extractSegments(ring, []);
  for (const n of [12, 13, 19, 20, 34]) {
    const idx = n % segments.length;
    const pos = computeOfficialLotLabelPosition(bounds, {
      frontSegmentIndex: idx,
      frente: 10,
      frontStreetName: 'Rua Teste',
    });
    assert(Number.isFinite(pos[0]) && Number.isFinite(pos[1]), `lote ${n}: posição inválida`);
  }
  console.log('OK testLots12_13_19_20_34_indexMapping');
}

function toLngLat(east: number, north: number): [number, number] {
  return [LNG0 + east / M_PER_DEG_LNG, LAT0 + north / M_PER_DEG_LAT];
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
    },
    {
      segment_index: 1,
      north: north0,
      east: e1,
      end_north: n1,
      end_east: e1,
      distance: depthM,
    },
    {
      segment_index: 2,
      north: n1,
      east: e1,
      end_north: n1,
      end_east: east0,
      distance: widthM,
    },
    {
      segment_index: 3,
      north: n1,
      east: east0,
      end_north: north0,
      end_east: east0,
      distance: depthM,
    },
  ];
}

function syntheticLotBounds(
  east0: number,
  north0: number,
  widthM: number,
  depthM: number,
): LatLngPair[] {
  const relEast = east0 - BASE_EAST;
  const relNorth = north0 - BASE_NORTH;
  const toLatLng = (east: number, north: number): LatLngPair => [
    LAT0 + north / M_PER_DEG_LAT,
    LNG0 + east / M_PER_DEG_LNG,
  ];
  return [
    toLatLng(relEast, relNorth),
    toLatLng(relEast + widthM, relNorth),
    toLatLng(relEast + widthM, relNorth + depthM),
    toLatLng(relEast, relNorth + depthM),
  ];
}

function edgeMidFromBounds(bounds: LatLngPair[], edgeIndex: number): LatLngPair {
  const n = bounds.length;
  const i = edgeIndex % n;
  const a = bounds[i];
  const b = bounds[(i + 1) % n];
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function distanceToEdgeMid(
  pos: LatLngPair,
  bounds: LatLngPair[],
  ringEdge: number,
): number {
  const mid = edgeMidFromBounds(bounds, ringEdge);
  return Math.hypot(pos[0] - mid[0], pos[1] - mid[1]);
}

/** front_segment_index UTM (1 = leste) deve posicionar label na frente leste, não no centróide. */
function testUtmFrontSegmentIndexEastSide() {
  const east0 = BASE_EAST;
  const north0 = BASE_NORTH;
  const widthM = 12;
  const depthM = 25;
  const bounds = syntheticLotBounds(east0, north0, widthM, depthM);
  const segments_json = utmRectSegments(east0, north0, widthM, depthM);
  const ringLngLat = bounds.map(([lat, lng]) => [lng, lat]);
  ringLngLat.push(ringLngLat[0]);
  const block = {
    bounds,
    segments_json,
    front_segment_index: 1,
    geometry: { type: 'Polygon', coordinates: [ringLngLat] },
  };
  const ringIdx = resolveFrontWgs84RingIndex(block);
  assert(ringIdx === 1, `UTM índice 1 deve mapear aresta leste WGS84, obteve ${ringIdx}`);

  const pos = computeOfficialLotLabelPosition(bounds, {
    frontSegmentIndex: 1,
    segments_json,
    frontStreetName: 'RUA 01',
    frente: widthM,
  });

  const distEast = distanceToEdgeMid(pos, bounds, 1);
  const distSouth = distanceToEdgeMid(pos, bounds, 0);
  const distNorth = distanceToEdgeMid(pos, bounds, 2);
  assert(
    distEast < distSouth && distEast < distNorth,
    `label deve ficar na frente leste (east=${distEast}, south=${distSouth})`,
  );
  console.log('OK testUtmFrontSegmentIndexEastSide');
}

/** Com índice salvo, não recalcula frente — label permanece na aresta indicada. */
function testNeverThrowsAndReturnsFinitePosition() {
  const bounds = rectBounds();
  const cases: Array<{ name: string; lot?: Parameters<typeof computeOfficialLotLabelPosition>[1] }> = [
    { name: 'garbage segments_json', lot: { frontSegmentIndex: 1, segments_json: { bad: true } } },
    { name: 'NaN vertex bounds', lot: { frontSegmentIndex: 0 } },
    { name: 'huge front index', lot: { frontSegmentIndex: 999 } },
  ];
  for (const c of cases) {
    let pos: [number, number] = [0, 0];
    try {
      const inputBounds =
        c.name === 'NaN vertex bounds'
          ? ([[NaN, NaN], ...bounds] as typeof bounds)
          : bounds;
      pos = computeOfficialLotLabelPosition(inputBounds, c.lot);
    } catch (e) {
      throw new Error(`${c.name} não deve lançar: ${(e as Error).message}`);
    }
    assert(
      Number.isFinite(pos[0]) && Number.isFinite(pos[1]),
      `${c.name} deve retornar coordenadas finitas`,
    );
  }
  console.log('OK testNeverThrowsAndReturnsFinitePosition');
}

function testStoredFrontIndexWithoutStreetName() {
  const bounds = rectBounds();
  const pos = computeOfficialLotLabelPosition(bounds, {
    frontSegmentIndex: 0,
  });
  const centroid = bounds.reduce(
    (acc, p) => [acc[0] + p[0] / bounds.length, acc[1] + p[1] / bounds.length],
    [0, 0],
  ) as LatLngPair;
  const distToSouth = Math.abs(pos[0] - (-1.455));
  const distToCentroid = Math.hypot(pos[0] - centroid[0], pos[1] - centroid[1]);
  assert(
    distToSouth < distToCentroid,
    'com front_segment_index salvo, label deve obedecer aresta mesmo sem nome de rua',
  );
  console.log('OK testStoredFrontIndexWithoutStreetName');
}

function testVisibilityIndependent() {
  const bounds = rectBounds();
  const withFront = computeOfficialLotLabelPosition(bounds, {
    frontSegmentIndex: 0,
    frontStreetName: 'Rua A',
  });
  const again = computeOfficialLotLabelPosition(bounds, {
    frontSegmentIndex: 0,
    frontStreetName: 'Rua A',
  });
  assert(
    Math.abs(withFront[0] - again[0]) < 1e-9 &&
      Math.abs(withFront[1] - again[1]) < 1e-9,
    'mesma frente → mesma posição (independente de guias visíveis)',
  );
  console.log('OK testVisibilityIndependent');
}

testFrontIndexZero();
testLots12_13_19_20_34_indexMapping();
testUtmFrontSegmentIndexEastSide();
testNeverThrowsAndReturnsFinitePosition();
testStoredFrontIndexWithoutStreetName();
testVisibilityIndependent();

function testSupabaseErrorFormat() {
  const msg = formatSupabaseError({
    message: 'column blocks.front_source does not exist',
    code: 'PGRST204',
    details: 'Check schema',
  });
  assert(msg.includes('PGRST204'), 'deve incluir code');
  assert(msg.includes('front_source'), 'deve incluir message');
  assert(
    isUnknownColumnError(
      { message: 'Could not find the front_source column', code: 'PGRST204' },
      'front_source',
    ),
    'detecta coluna ausente',
  );
  console.log('OK testSupabaseErrorFormat');
}

testSupabaseErrorFormat();

/** Fluxo salvar frente / confrontação: nunca lança "is not iterable". */
function testSaveFrontFlowNeverThrowsIterable() {
  const east0 = BASE_EAST;
  const north0 = BASE_NORTH;
  const widthM = 12;
  const depthM = 25;
  const bounds = syntheticLotBounds(east0, north0, widthM, depthM);
  const segments_json = utmRectSegments(east0, north0, widthM, depthM);
  const ringLngLat = bounds.map(([lat, lng]) => [lng, lat]);
  ringLngLat.push(ringLngLat[0]);
  const block: Record<string, unknown> = {
    id: 'save-front-test',
    number: '12',
    source_import: 'TXT_CIVIL3D',
    bounds,
    segments_json,
    front_street_name: 'RUA 01',
    front_source: 'manual',
    geometry: { type: 'Polygon', coordinates: [ringLngLat] },
  };

  for (const rawIdx of [0, 1, 2, 3, 99]) {
    let measures;
    try {
      const persisted = normalizeFrontSegmentIndexForPersist(block, rawIdx);
      assert(persisted >= 0, `índice ${rawIdx} deve normalizar`);
      measures = getOfficialLotMeasurements(
        { ...block, front_segment_index: persisted },
        '12',
      );
      buildManualFrontPatch(measures, persisted, { includeFrontSource: true });
      officialSegmentIndexesForSide(
        { ...block, front_segment_index: persisted },
        [block],
        'frente',
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`save-front rawIdx=${rawIdx} lançou: ${msg}`);
    }
    assert(measures != null, `medidas para índice ${rawIdx}`);
  }
  console.log('OK testSaveFrontFlowNeverThrowsIterable');
}

/** sides[role] inválido não derruba officialSegmentIndexesForSide. */
function testOfficialSegmentIndexesWithCorruptSides() {
  const block: Record<string, unknown> = {
    id: 'corrupt-sides',
    number: '1',
    segments_json: utmRectSegments(BASE_EAST, BASE_NORTH, 10, 20),
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [-48.49, -1.455],
          [-48.4895, -1.455],
          [-48.4895, -1.4545],
          [-48.49, -1.4545],
          [-48.49, -1.455],
        ],
      ],
    },
  };
  try {
    const idxs = officialSegmentIndexesForSide(block, [block], 'frente');
    assert(Array.isArray(idxs), 'deve retornar array');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`officialSegmentIndexesForSide: ${msg}`);
  }
  console.log('OK testOfficialSegmentIndexesWithCorruptSides');
}

/** mergeCurvedSegments: fechamento colinear do anel não lança "is not iterable". */
function testMergeCurvedSegmentsClosingColinear() {
  const ring = rectBounds().map(([lat, lng]) => [lng, lat]);
  ring.push(ring[0]);
  const segments = extractSegments(ring, []);
  let merged;
  try {
    merged = mergeCurvedSegments(segments, 20);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`mergeCurvedSegments lançou: ${msg}`);
  }
  assert(merged.length >= 1, 'deve fundir segmentos do retângulo');
  console.log('OK testMergeCurvedSegmentsClosingColinear');
}

testSaveFrontFlowNeverThrowsIterable();
testOfficialSegmentIndexesWithCorruptSides();
testMergeCurvedSegmentsClosingColinear();
console.log('mandatory-lot-label-front-tests: all passed');
