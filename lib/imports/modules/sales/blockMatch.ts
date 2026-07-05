/**
 * Localização flexível de quadra/lote — importação de vendas.
 * Reutiliza normalização do GIS (shapefileImport).
 */

import { normalizeLotNumberForMatch } from '@/lib/shapefileImport';
import { normalizeImportEntityName } from '@/lib/imports/modules/sales/normalize';
import type { SalesBlockRecord } from '@/lib/imports/modules/sales/types';

export function buildQuadraMatchVariants(raw: string): string[] {
  const variants = new Set<string>();
  const upper = normalizeImportEntityName(raw);
  if (!upper) return [];

  variants.add(upper);

  const withoutPrefix = upper
    .replace(/^QUADRA\s+/i, '')
    .replace(/^QD\s*/i, '')
    .replace(/^Q\s+/i, '')
    .trim();
  if (withoutPrefix) variants.add(withoutPrefix);

  const numMatch = upper.match(/(\d+)\s*$/);
  if (numMatch) {
    const num = numMatch[1];
    const padded = num.padStart(2, '0');
    for (const n of new Set([num, padded])) {
      variants.add(n);
      variants.add(`QD ${n}`);
      variants.add(`QUADRA ${n}`);
      variants.add(`Q ${n}`);
    }
  }

  return [...variants].filter(Boolean);
}

export function buildLoteMatchVariants(raw: string): string[] {
  const variants = new Set<string>();
  const upper = normalizeImportEntityName(raw);
  const normalized = normalizeLotNumberForMatch(raw);

  if (normalized) {
    variants.add(normalized);
    variants.add(`LOTE ${normalized}`);
    variants.add(`LT ${normalized}`);
    variants.add(`L ${normalized}`);
  }
  if (upper) variants.add(upper);

  return [...variants].filter(Boolean);
}

export function buildBlockIndexKey(projectId: string, quadra: string, lote: string): string {
  return `${projectId}::${quadra}::${lote}`;
}

export function getBlockQuadraRaw(block: SalesBlockRecord): string {
  return String(block.block_name || block.name || '').trim();
}

export function getBlockLoteRaw(block: SalesBlockRecord): string {
  return String(block.lot_number || block.number || '').trim();
}

export function registerBlockInIndex(
  index: Map<string, SalesBlockRecord>,
  block: SalesBlockRecord,
): void {
  const quadraRaw = getBlockQuadraRaw(block);
  const loteRaw = getBlockLoteRaw(block);
  if (!block.project_id || !quadraRaw || !loteRaw) return;

  for (const quadra of buildQuadraMatchVariants(quadraRaw)) {
    for (const lote of buildLoteMatchVariants(loteRaw)) {
      index.set(buildBlockIndexKey(block.project_id, quadra, lote), block);
    }
  }
}

export function lookupBlockInIndex(
  index: Map<string, SalesBlockRecord>,
  projectId: string,
  quadraRaw: string,
  loteRaw: string,
): SalesBlockRecord | null {
  for (const quadra of buildQuadraMatchVariants(quadraRaw)) {
    for (const lote of buildLoteMatchVariants(loteRaw)) {
      const hit = index.get(buildBlockIndexKey(projectId, quadra, lote));
      if (hit) return hit;
    }
  }
  return null;
}

export function formatBlockLabel(block: SalesBlockRecord): string {
  const quadra = getBlockQuadraRaw(block) || '?';
  const lote = getBlockLoteRaw(block);
  const loteLabel = lote ? normalizeLotNumberForMatch(lote) || lote : '?';
  return `${quadra} / Lote ${loteLabel}`;
}

export function suggestSimilarBlocks(
  blocks: SalesBlockRecord[],
  quadraRaw: string,
  loteRaw: string,
  limit = 3,
): string[] {
  const qVariants = buildQuadraMatchVariants(quadraRaw);
  const lVariants = buildLoteMatchVariants(loteRaw);
  const suggestions: string[] = [];
  const seen = new Set<string>();

  const addSuggestion = (block: SalesBlockRecord) => {
    const label = formatBlockLabel(block);
    if (seen.has(label)) return;
    seen.add(label);
    suggestions.push(label);
  };

  for (const block of blocks) {
    const bqVariants = buildQuadraMatchVariants(getBlockQuadraRaw(block));
    const bl = normalizeLotNumberForMatch(getBlockLoteRaw(block));
    const quadraMatch = qVariants.some((q) => bqVariants.includes(q));
    const loteMatch = lVariants.some((l) => normalizeLotNumberForMatch(l) === bl);
    if (quadraMatch && loteMatch) addSuggestion(block);
    if (suggestions.length >= limit) return suggestions;
  }

  for (const block of blocks) {
    const bqVariants = buildQuadraMatchVariants(getBlockQuadraRaw(block));
    const quadraMatch = qVariants.some((q) => bqVariants.includes(q));
    if (quadraMatch) addSuggestion(block);
    if (suggestions.length >= limit) return suggestions;
  }

  for (const block of blocks) {
    const bl = normalizeLotNumberForMatch(getBlockLoteRaw(block));
    const loteMatch = lVariants.some((l) => normalizeLotNumberForMatch(l) === bl);
    if (loteMatch) addSuggestion(block);
    if (suggestions.length >= limit) return suggestions;
  }

  return suggestions;
}

export function buildBlockNotFoundMessage(
  quadraRaw: string,
  loteRaw: string,
  suggestions: string[],
): string {
  const searched = `${quadraRaw.trim()} / ${loteRaw.trim()}`;
  if (suggestions.length === 0) {
    return `Quadra/lote não encontrado. Procurado: ${searched}.`;
  }
  return `Quadra/lote não encontrado. Procurado: ${searched}. Sugestões: ${suggestions.join(', ')}`;
}
