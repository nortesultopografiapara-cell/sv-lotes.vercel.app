/**
 * Quadra 123 — confrontação oficial UTM (segments_json).
 * Executar: npm run test:quadra123-confrontation
 */

import { buildSideConfrontantsFromSegments } from '../lib/lotSegmentConfrontation';
import { getOfficialConfrontationRing } from '../lib/officialConfrontationRing';
import { validateConfrontationLot } from '../lib/lotGeometryNormalize';

/** Evita coincidência distance === east/north (rejeição em extractOfficialSegmentDistance). */
const BASE_EAST = 10000;
const BASE_NORTH = 20000;

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

function buildQuadra123Blocks(): Record<string, unknown>[] {
  const e = BASE_EAST;
  const n = BASE_NORTH;
  return [
    blockUtm('b1', '1', e, n, 10, 24),
    blockUtm('b2', '2', e + 10, n, 10, 24),
    blockUtm('b3', '3', e + 20, n, 10, 24),
    blockUtm('b4', '4', e + 30, n, 10, 24),
    blockUtm('b5', '5', e + 40, n, 10, 24),
    blockUtm('b6', '6', e + 50, n, 10, 24),
    blockUtm('b25', '25', e, n + 24, 20, 24),
    blockUtm('b24', '24', e + 40, n + 24, 10, 24),
  ];
}

function runCase(
  name: string,
  targetId: string,
  expected: Record<string, string>,
): boolean {
  const blocks = buildQuadra123Blocks();
  const target = blocks.find((b) => b.id === targetId)!;
  const validation = validateConfrontationLot(target);
  if (!validation.valid || validation.ringSource !== 'segments_json') {
    console.log(
      `  FALHOU validação: valid=${validation.valid} source=${validation.ringSource} reason=${validation.reason}`,
    );
    console.log(`FALHOU — ${name}`);
    return false;
  }

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

console.log('Testes Quadra 123 — confrontação UTM oficial\n');
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

console.log(`\nTotal: ${pass} PASSOU / ${total - pass} FALHOU de ${total}`);
process.exit(pass === total ? 0 : 1);
