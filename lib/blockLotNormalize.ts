/**
 * Normalização de medidas de lote/bloco sem depender de colunas fixas no schema.
 */

export const LOT_MEASURE_NOT_INFORMED = 'Não informado';

function pickRaw(...values: unknown[]): unknown {
  for (const v of values) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' && !v.trim()) continue;
    return v;
  }
  return null;
}

export type BlockSideKey = 'frente' | 'fundo' | 'ladoDireito' | 'ladoEsquerdo';

/** Lê medida bruta do row sem assumir nomes de coluna do Postgres. */
export function pickBlockSideRaw(
  block: Record<string, unknown>,
  side: BlockSideKey,
): unknown {
  const b = block;
  switch (side) {
    case 'frente':
      return pickRaw(
        b.frente,
        b.Frente,
        b.front,
        b.medida_frente,
        b.width,
      );
    case 'fundo':
      return pickRaw(
        b.fundo,
        b.Fundo,
        b['Fundo'],
        b.back,
        b.medida_fundo,
      );
    case 'ladoDireito':
      return pickRaw(
        b.lado_direito,
        b.ladoDireito,
        b.lado_dir,
        b['Lado Dir.'],
        b['Lado Dir'],
        b.right_side,
        b.medida_lado_direito,
      );
    case 'ladoEsquerdo':
      return pickRaw(
        b.lado_esquerdo,
        b.ladoEsquerdo,
        b.lado_esq,
        b['Lado Esq.'],
        b['Lado Esq'],
        b.left_side,
        b.medida_lado_esquerdo,
      );
    default:
      return null;
  }
}

export function formatLotMeasureDisplay(val: unknown): string {
  if (val === null || val === undefined || val === '') {
    return LOT_MEASURE_NOT_INFORMED;
  }
  const s = String(val).trim();
  return s || LOT_MEASURE_NOT_INFORMED;
}

export type NormalizedLotMeasuresDisplay = {
  frente: string;
  fundo: string;
  ladoDireito: string;
  ladoEsquerdo: string;
};

export function getNormalizedLotMeasuresDisplay(
  block: Record<string, unknown>,
): NormalizedLotMeasuresDisplay {
  return {
    frente: formatLotMeasureDisplay(pickBlockSideRaw(block, 'frente')),
    fundo: formatLotMeasureDisplay(pickBlockSideRaw(block, 'fundo')),
    ladoDireito: formatLotMeasureDisplay(pickBlockSideRaw(block, 'ladoDireito')),
    ladoEsquerdo: formatLotMeasureDisplay(pickBlockSideRaw(block, 'ladoEsquerdo')),
  };
}

/**
 * Preenche chaves canônicas usadas pelo contractTemplate / lotChanfre
 * a partir de qualquer combinação de colunas existentes no row.
 */
export function normalizeBlockForContractRegeneration(
  block: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!block || typeof block !== 'object') return {};

  const frente = pickBlockSideRaw(block, 'frente');
  const fundo = pickBlockSideRaw(block, 'fundo');
  const ladoDireito = pickBlockSideRaw(block, 'ladoDireito');
  const ladoEsquerdo = pickBlockSideRaw(block, 'ladoEsquerdo');

  return {
    ...block,
    frente: frente ?? block.frente ?? block.Frente ?? '',
    fundo: fundo ?? block.fundo ?? '',
    Fundo: fundo ?? block.Fundo ?? block['Fundo'] ?? '',
    lado_direito: ladoDireito ?? block.lado_direito ?? '',
    lado_esquerdo: ladoEsquerdo ?? block.lado_esquerdo ?? '',
    'Lado Dir.':
      ladoDireito ??
      block['Lado Dir.'] ??
      block['Lado Dir'] ??
      block.ladoDireito ??
      '',
    'Lado Esq.':
      ladoEsquerdo ??
      block['Lado Esq.'] ??
      block['Lado Esq'] ??
      block.ladoEsquerdo ??
      '',
    segments_json: block.segments_json,
    area: block.area,
  };
}
