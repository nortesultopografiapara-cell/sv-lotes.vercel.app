/**
 * Segmentos com distance/length 0 no JSON — fallback por end_north/end_east.
 * Executar: npm run test:zero-distance-segment
 */

import {
  extractOfficialSegmentDistance,
  parseOfficialSegmentsFromBlock,
} from '../lib/officialLotMeasurements';
import {
  asStreetGuideList,
  confrontantFromStreetGuidesForSegment,
  flattenLineStringCoordinates,
} from '../lib/streetGuideConfrontation';
import { detectFrontEdgeIndexFromGuides } from '../lib/resolveFrontStreetGuide';

const BASE_EAST = 50000;
const BASE_NORTH = 60000;

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function blockWithZeroDistance(): Record<string, unknown> {
  const w = 12;
  const d = 30;
  const e0 = BASE_EAST;
  const n0 = BASE_NORTH;
  const e1 = e0 + w;
  const n1 = n0 + d;
  return {
    id: 'zdist-1',
    number: '01',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [-47.1, -22.1],
          [-47.099, -22.1],
          [-47.099, -22.099],
          [-47.1, -22.099],
          [-47.1, -22.1],
        ],
      ],
    },
    segments_json: [
      {
        segment_index: 0,
        north: n0,
        east: e0,
        end_north: n0,
        end_east: e1,
        distance: 0,
        length: 0,
        segment_type: 'LINE',
      },
      {
        segment_index: 1,
        north: n0,
        east: e1,
        end_north: n1,
        end_east: e1,
        distance: d,
        segment_type: 'LINE',
      },
      {
        segment_index: 2,
        north: n1,
        east: e1,
        end_north: n1,
        end_east: e0,
        distance: w,
        segment_type: 'LINE',
      },
      {
        segment_index: 3,
        north: n1,
        east: e0,
        end_north: n0,
        end_east: e0,
        distance: d,
        segment_type: 'LINE',
      },
    ],
  };
}

function testEndpointFallback(): void {
  const raw = {
    north: BASE_NORTH,
    east: BASE_EAST,
    end_north: BASE_NORTH,
    end_east: BASE_EAST + 15.5,
    distance: 0,
    length: 0,
  };
  const len = extractOfficialSegmentDistance(raw, 'T');
  assert(len === 15.5, `expected 15.5 from endpoints, got ${len}`);
  const parsed = parseOfficialSegmentsFromBlock(blockWithZeroDistance(), '01');
  assert(parsed.length === 4, `expected 4 segments, got ${parsed.length}`);
  assert(parsed[0].distance === 12, 'first segment distance from endpoints');
}

function testNestedGuideCoords(): void {
  const nested = [
    [
      [-47.1005, -22.1005],
      [-47.0995, -22.1005],
    ],
  ];
  const flat = flattenLineStringCoordinates(nested);
  assert(flat != null && flat.length === 2, 'flatten nested LineString ring');
  const hit = confrontantFromStreetGuidesForSegment(
    [-47.1005, -22.1005],
    [-47.0995, -22.1005],
    [
      {
        id: 'g1',
        name: 'Rua Teste',
        type: 'Rua',
        active: true,
        geometry_geojson: { type: 'Polygon', coordinates: nested },
      },
    ],
    50,
  );
  assert(hit?.label != null, 'street guide match with nested coordinates');
}

function testNullStreetGuidesIterable(): void {
  const block = blockWithZeroDistance();
  const idx = detectFrontEdgeIndexFromGuides(
    block,
    null as unknown as import('../lib/streetGuideConfrontation').StreetGuideConfrontInput[],
    5,
  );
  assert(idx === null, 'null guides should not throw');
  assert(asStreetGuideList(null).length === 0, 'null -> empty list');
  assert(asStreetGuideList(undefined).length === 0, 'undefined -> empty list');
}

function main(): void {
  testEndpointFallback();
  testNestedGuideCoords();
  testNullStreetGuidesIterable();
  console.log('mandatory-zero-distance-segment-tests: OK');
}

main();
