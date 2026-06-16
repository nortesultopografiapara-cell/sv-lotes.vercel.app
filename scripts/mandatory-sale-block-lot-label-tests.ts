/**
 * Testes — rótulo quadra/lote em vendas (Corretores x Atividades Recentes).
 * npx tsx scripts/mandatory-sale-block-lot-label-tests.ts
 */

import {
  formatSaleBlockLotLabel,
  formatSaleLotsLabel,
  resolveBlocksForSale,
  resolveLoteFromBlock,
} from '../lib/saleBlockLotLabel';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testMenesesLikeBlock() {
  const block = {
    id: 'b17',
    sale_id: 'sale-1',
    block: '01',
    block_name: 'QUADRA 01',
    name: '01',
    lote: '17',
    lot_number: '17',
  };
  assert(resolveLoteFromBlock(block) === '17', 'prioriza lote sobre name');
  assert(formatSaleBlockLotLabel(block) === 'QD 01 - LT 17', 'rótulo meneses lt 17');
  console.log('OK testMenesesLikeBlock');
}

function testActivitiesMatchBrokersTable() {
  const blocks = [
    { id: 'b17', sale_id: 's1', block: '01', name: '01', lote: '17' },
    { id: 'b18', sale_id: 's2', block: '01', name: '01', lote: '18' },
    { id: 'b19', sale_id: 's3', block: '01', name: '01', lot_number: '19' },
    { id: 'b20', sale_id: 's4', block: '01', name: '01', number: '20' },
  ];

  for (const sale of [
    { id: 's1', expected: 'QD 01 - LT 17' },
    { id: 's2', expected: 'QD 01 - LT 18' },
    { id: 's3', expected: 'QD 01 - LT 19' },
    { id: 's4', expected: 'QD 01 - LT 20' },
  ]) {
    const label = formatSaleLotsLabel({ id: sale.id }, blocks);
    assert(label === sale.expected, `venda ${sale.id}: ${label}`);
  }

  const wrongLegacy = blocks
    .filter((bl) => bl.sale_id === 's1')
    .map((bl) => `QD ${bl.block || bl.block_name || '?'} - LT ${bl.name || '?'}`)
    .join(', ');
  assert(wrongLegacy === 'QD 01 - LT 01', 'legado mostrava LT 01');
  console.log('OK testActivitiesMatchBrokersTable');
}

function testBlockIdFallback() {
  const blocks = [{ id: 'b18', block: '01', lote: '18' }];
  const resolved = resolveBlocksForSale({ id: 's-x', block_id: 'b18' }, blocks);
  assert(resolved.length === 1 && formatSaleBlockLotLabel(resolved[0]) === 'QD 01 - LT 18', 'fallback block_id');
  console.log('OK testBlockIdFallback');
}

function main() {
  testMenesesLikeBlock();
  testActivitiesMatchBrokersTable();
  testBlockIdFallback();
  console.log('\nTodos os testes saleBlockLotLabel passaram.');
}

main();
