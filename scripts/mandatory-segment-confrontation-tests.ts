/**
 * Testes de confrontação por segmento — layout Quadra 123 (Lote 2 e Lote 5).
 * Executar: npx tsx scripts/mandatory-segment-confrontation-tests.ts
 */

import { buildSideConfrontantsFromSegments } from '../lib/lotSegmentConfrontation';
import { latLngRingFromBlock } from '../lib/lotSheetEnrichment';

const LAT0 = -23.5;
const LNG0 = -46.6;
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LNG = 111320 * Math.cos((LAT0 * Math.PI) / 180);

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
  return [toLat(x0, y0), toLat(x0 + w, y0), toLat(x0 + w, y0 + h), toLat(x0, y0 + h)];
}

function block(
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

function runCase(name: string, targetId: string, expected: Record<string, string>) {
  const blocks: Record<string, unknown>[] = [
    block('b1', '1', rectRing(0, 0, 10, 24)),
    block('b2', '2', rectRing(10, 0, 10, 24)),
    block('b3', '3', rectRing(20, 0, 10, 24)),
    block('b4', '4', rectRing(30, 0, 10, 24)),
    block('b5', '5', rectRing(40, 0, 10, 24)),
    block('b6', '6', rectRing(50, 0, 10, 24)),
    block('b25', '25', rectRing(0, 24, 20, 24)),
    block('b24', '24', rectRing(40, 24, 10, 24)),
    block('b7', '7', rectRing(50, 24, 10, 24)),
  ];

  const target = blocks.find((b) => b.id === targetId)!;
  const ring = latLngRingFromBlock(target);
  const got = buildSideConfrontantsFromSegments(
    target,
    targetId,
    ring,
    blocks,
    [],
  );

  const keys = ['frente', 'ladoEsquerdo', 'ladoDireito', 'fundo'] as const;
  let ok = true;
  for (const k of keys) {
    const exp = expected[k];
    const match =
      k === 'frente'
        ? /Rua\s*02/i.test(got[k])
        : got[k] === exp;
    if (!match) {
      ok = false;
      console.log(`  FALHOU ${k}: esperado "${exp}", obteve "${got[k]}"`);
    }
  }
  console.log(`${ok ? 'PASSOU' : 'FALHOU'} — ${name}`);
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

console.log(`\nTotal: ${pass} PASSOU / ${total - pass} FALHOU de ${total}`);
process.exit(pass === total ? 0 : 1);
