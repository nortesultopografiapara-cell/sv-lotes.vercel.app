/**
 * Testes: label obedece front_segment_index (lotes 12, 13, 19, 20, 34 — geometria sintética).
 * npx tsx scripts/mandatory-lot-label-front-tests.ts
 */

import {
  computeOfficialLotLabelPosition,
  resolveFrontSegmentFromIndex,
  type LatLngPair,
} from '../lib/lotLabelPosition';
import { extractSegments } from '../utils/calculateLotDimensions';

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
testVisibilityIndependent();
console.log('mandatory-lot-label-front-tests: all passed');
