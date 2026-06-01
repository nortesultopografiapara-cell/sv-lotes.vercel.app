/**
 * Contrato — cláusula do lote sem confrontações.
 * Executar: npx tsx scripts/mandatory-contract-lot-clause-tests.ts
 */

import { formatContractLotBoundariesClause } from '../lib/contractLotBoundaries';

let pass = 0;
let total = 0;

function assert(name: string, ok: boolean) {
  total++;
  console.log(`${ok ? 'PASSOU' : 'FALHOU'} — ${name}`);
  if (ok) pass++;
}

const block: Record<string, unknown> = {
  id: 'b5',
  number: '5',
  frente: 10,
  fundo: 10,
  'Lado Dir.': 24,
  'Lado Esq.': 24,
};

const clause = formatContractLotBoundariesClause({ block });

assert('inicia com medindo', /^medindo:/i.test(clause));
assert('inclui Frente e Fundo', /Frente:/i.test(clause) && /Fundo:/i.test(clause));
assert('inclui laterais', /Lado Direito:/i.test(clause) && /Lado Esquerdo:/i.test(clause));
assert('sem confrontando', !/confrontando/i.test(clause));
assert('sem confrontação pendente', !/confrontação pendente/i.test(clause));
assert('sem Lote ou Rua como vizinho', !/Lote \d/i.test(clause) && !/Rua/i.test(clause));

const withChanfre = formatContractLotBoundariesClause({
  block: {
  ...block,
  segments_json: [
    { north: 1, east: 2, distance: 10, end_north: 1, end_east: 12 },
    { north: 1, east: 12, distance: 3, end_north: 4, end_east: 12 },
    { north: 4, east: 12, distance: 10, end_north: 4, end_east: 2 },
    { north: 4, east: 2, distance: 24, end_north: 1, end_east: 2 },
  ],
  },
});

assert(
  'chanfre opcional não exige confrontação',
  !/confrontando/i.test(withChanfre),
);

console.log(`\nTotal: ${pass} PASSOU / ${total - pass} FALHOU de ${total}`);
process.exit(pass === total ? 0 : 1);
