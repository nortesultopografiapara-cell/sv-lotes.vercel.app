/**
 * Rótulo quadra/lote para vendas — mesma resolução usada na tabela de Corretores.
 */

export type SaleBlockRef = {
  id?: string;
  block_id?: string | null;
  lot_id?: string | null;
};

export type BlockLotRow = {
  id?: string;
  sale_id?: string | null;
  quadra?: string | null;
  quadra_number?: string | null;
  block_number?: string | null;
  block?: string | null;
  block_name?: string | null;
  lote?: string | null;
  lot_number?: string | null;
  number?: string | null;
  lot?: string | null;
  name?: string | null;
};

export function resolveQuadraFromBlock(block: BlockLotRow | null | undefined): string {
  if (!block) return '';
  return String(
    block.quadra ??
      block.quadra_number ??
      block.block_number ??
      block.block ??
      block.block_name ??
      '',
  ).trim();
}

/** Número do lote — prioriza lote/lot_number antes de name (name pode ser label interno). */
export function resolveLoteFromBlock(block: BlockLotRow | null | undefined): string {
  if (!block) return '';
  return String(
    block.lote ?? block.lot_number ?? block.number ?? block.lot ?? block.name ?? '',
  ).trim();
}

export function formatSaleBlockLotLabel(block: BlockLotRow | null | undefined): string {
  const qString = resolveQuadraFromBlock(block);
  const nameString = resolveLoteFromBlock(block);
  if (!qString && !nameString) return '';
  return `QD ${qString || '?'} - LT ${nameString || '?'}`;
}

/** Blocos vinculados à venda (sale_id ou block_id/lot_id na venda). */
export function resolveBlocksForSale(
  sale: SaleBlockRef,
  blockData: BlockLotRow[],
): BlockLotRow[] {
  let blocksForSale = blockData.filter((bl) => bl.sale_id === sale.id);
  if (blocksForSale.length === 0 && (sale.block_id || sale.lot_id)) {
    const directBlock = blockData.find(
      (bl) => bl.id === sale.block_id || bl.id === sale.lot_id,
    );
    if (directBlock) blocksForSale = [directBlock];
  }
  return blocksForSale;
}

export function formatSaleLotsLabel(
  sale: SaleBlockRef,
  blockData: BlockLotRow[],
): string {
  const blocks = resolveBlocksForSale(sale, blockData);
  if (blocks.length === 0) return '';
  return blocks.map((bl) => formatSaleBlockLotLabel(bl)).filter(Boolean).join(', ');
}
