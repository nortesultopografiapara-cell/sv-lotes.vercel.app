/**

 * Testes de confrontação por segmento — layout Quadra 123 (UTM segments_json).

 * Executar: npx tsx scripts/mandatory-segment-confrontation-tests.ts

 */



import { buildSideConfrontantsFromSegments } from '../lib/lotSegmentConfrontation';

import { getOfficialConfrontationRing } from '../lib/officialConfrontationRing';

import {

  normalizeLotGeometry,

  normalizeLotSegments,

  validateConfrontationLot,

} from '../lib/lotGeometryNormalize';



const BASE_EAST = 10000;
const BASE_NORTH = 20000;

const LAT0 = -23.5;

const LNG0 = -46.6;

const M_PER_DEG_LAT = 111320;

const M_PER_DEG_LNG = 111320 * Math.cos((LAT0 * Math.PI) / 180);



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



function blockUtm(

  id: string,

  num: string,

  east0: number,

  north0: number,

  w: number,

  h: number,

): Record<string, unknown> {

  return {

    id,

    number: num,

    block_name: '123',

    front_segment_index: 0,

    front_street_name: 'Rua 02',

    segments_json: utmRectSegments(east0, north0, w, h),

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



function blockWithGeometry(

  id: string,

  num: string,

  ring: [number, number][],

  frontIdx = 0,

): Record<string, unknown> {

  const coords = ring.map(([lat, lng]) => [lng, lat]);

  return {

    id,

    number: num,

    block_name: '123',

    front_segment_index: frontIdx,

    front_street_name: 'Rua 02',

    geometry: {

      type: 'Polygon',

      coordinates: [[...coords, coords[0]]],

    },

  };

}



function buildQuadra123Blocks(): Record<string, unknown>[] {

  return [

    blockUtm('b1', '1', BASE_EAST, BASE_NORTH, 10, 24),

    blockUtm('b2', '2', BASE_EAST + 10, BASE_NORTH, 10, 24),

    blockUtm('b3', '3', BASE_EAST + 20, BASE_NORTH, 10, 24),

    blockUtm('b4', '4', BASE_EAST + 30, BASE_NORTH, 10, 24),

    blockUtm('b5', '5', BASE_EAST + 40, BASE_NORTH, 10, 24),

    blockUtm('b6', '6', BASE_EAST + 50, BASE_NORTH, 10, 24),

    blockUtm('b25', '25', BASE_EAST, BASE_NORTH + 24, 20, 24),

    blockUtm('b24', '24', BASE_EAST + 40, BASE_NORTH + 24, 10, 24),

    blockUtm('b7', '7', BASE_EAST + 50, BASE_NORTH + 24, 10, 24),

  ];

}



function runCase(

  name: string,

  targetId: string,

  expected: Record<string, string>,

) {

  const blocks = buildQuadra123Blocks();

  const target = blocks.find((b) => b.id === targetId)!;

  const official = getOfficialConfrontationRing(target);

  const got = buildSideConfrontantsFromSegments(

    target,

    targetId,

    official.ring,

    blocks,

    [],

  );



  const keys = ['frente', 'ladoEsquerdo', 'ladoDireito', 'fundo'] as const;

  let ok = true;

  for (const k of keys) {

    const exp = expected[k];

    const match =

      k === 'frente' ? /Rua\s*02/i.test(got[k]) : got[k] === exp;

    if (!match) {

      ok = false;

      console.log(`  FALHOU ${k}: esperado "${exp}", obteve "${got[k]}"`);

    }

  }

  console.log(`${ok ? 'PASSOU' : 'FALHOU'} — ${name}`);

  return ok;

}



function testNormalizeGeoJsonString() {

  const ring = rectRing(10, 0, 10, 24);

  const coords = ring.map(([lat, lng]) => [lng, lat]);

  const b: Record<string, unknown> = {

    id: 'gx',

    number: '2',

    geometry: JSON.stringify({

      type: 'Polygon',

      coordinates: [[...coords, coords[0]]],

    }),

  };

  const g = normalizeLotGeometry(b);

  const ok = g.ok && g.ring.length >= 4;

  console.log(`${ok ? 'PASSOU' : 'FALHOU'} — geometry como string JSON GeoJSON`);

  return ok;

}



function testNormalizeSegmentsJsonString() {

  const b: Record<string, unknown> = {

    id: 'sx',

    number: '2',

    segments_json: JSON.stringify(

      utmRectSegments(BASE_EAST + 10, BASE_NORTH, 10, 24),

    ) as unknown,

  };

  const v = validateConfrontationLot(b);

  const ok = v.valid && v.ringSource === 'segments_json';

  console.log(`${ok ? 'PASSOU' : 'FALHOU'} — segments_json como string JSON`);

  return ok;

}



function testSegmentsValidDespiteBadGeometry() {

  const b: Record<string, unknown> = {

    id: 'utm',

    number: '2',

    block_name: '123',

    front_segment_index: 0,

    front_street_name: 'Rua 02',

    segments_json: utmRectSegments(BASE_EAST + 10, BASE_NORTH, 10, 24),

    geometry: { type: 'Point', coordinates: [0, 0] },

  };

  const g = normalizeLotGeometry(b);

  const v = validateConfrontationLot(b);

  const ok = v.valid && v.ringSource === 'segments_json' && !g.ok;

  console.log(

    `${ok ? 'PASSOU' : 'FALHOU'} — segments_json válido com geometry inválida`,

  );

  return ok;

}



function testNormalizeSegmentsFromNullGeometry() {

  const ring = rectRing(10, 0, 10, 24);

  const coords = ring.map(([lat, lng]) => [lng, lat]);

  const b: Record<string, unknown> = {

    id: 'gn',

    number: '2',

    segments_json: null,

    geometry: {

      type: 'Polygon',

      coordinates: [[...coords, coords[0]]],

    },

  };

  const g = normalizeLotGeometry(b);

  const s = normalizeLotSegments(b, g.ring);

  const v = validateConfrontationLot(b);

  const ok =

    g.ok &&

    s.ok &&

    s.source === 'geometry_ring' &&

    s.segments.length >= 2 &&

    v.valid &&

    v.ringSource === 'geometry';

  console.log(

    `${ok ? 'PASSOU' : 'FALHOU'} — segments_json null, fallback geometry`,

  );

  return ok;

}



function testMultiPolygonGeometry() {

  const ring = rectRing(10, 0, 10, 24);

  const coords = ring.map(([lat, lng]) => [lng, lat]);

  const b: Record<string, unknown> = {

    id: 'mp',

    number: '2',

    geometry: {

      type: 'MultiPolygon',

      coordinates: [[[...coords, coords[0]]]],

    },

  };

  const g = normalizeLotGeometry(b);

  const ok = g.ok && g.geometryType === 'MultiPolygon' && g.ring.length >= 4;

  console.log(`${ok ? 'PASSOU' : 'FALHOU'} — geometry MultiPolygon GeoJSON`);

  return ok;

}



console.log('Testes confrontação por segmento\n');

let pass = 0;

let total = 0;



total++;

if (

  runCase('Lote 2 Quadra 123', 'b2', {

    frente: 'Rua 02',

    ladoEsquerdo: 'Lote 1',

    ladoDireito: 'Lote 3',

    fundo: 'Lote 25',

  })

) {

  pass++;

}



total++;

if (

  runCase('Lote 5 Quadra 123', 'b5', {

    frente: 'Rua 02',

    ladoEsquerdo: 'Lote 4',

    ladoDireito: 'Lote 6',

    fundo: 'Lote 24',

  })

) {

  pass++;

}



total++;

if (testNormalizeGeoJsonString()) pass++;



total++;

if (testNormalizeSegmentsJsonString()) pass++;



total++;

if (testSegmentsValidDespiteBadGeometry()) pass++;



total++;

if (testNormalizeSegmentsFromNullGeometry()) pass++;



total++;

if (testMultiPolygonGeometry()) pass++;



console.log(`\nTotal: ${pass} PASSOU / ${total - pass} FALHOU de ${total}`);

process.exit(pass === total ? 0 : 1);

