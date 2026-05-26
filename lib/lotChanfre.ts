/**
 * Chanfre: segmentos extras em lotes com mais de 4 lados (segments_json).
 * As 4 medidas principais vêm das colunas frente / fundo / laterais do lote.
 */

export type ChanfreInfo = {
  total: number;
  /** Medidas individuais dos segmentos considerados chanfre (m) */
  segments: number[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Converte valor de coluna do lote para metros. */
export function parseBlockSideLength(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n =
    typeof val === "number"
      ? val
      : parseFloat(String(val).replace(/[^\d.,-]/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0.01) return null;
  return n;
}

/** Extrai comprimentos válidos de segments_json (array de números ou { length }). */
export function parseSegmentLengthsFromJson(segmentsJson: unknown): number[] {
  if (!segmentsJson) return [];

  let data: unknown = segmentsJson;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(data)) return [];

  const out: number[] = [];
  for (const item of data) {
    let n: number | null = null;
    if (typeof item === "number" && Number.isFinite(item)) {
      n = item;
    } else if (typeof item === "string") {
      n = parseFloat(item.replace(/[^\d.,-]/g, "").replace(",", "."));
    } else if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      const raw = obj.length ?? obj.Length ?? obj.comprimento ?? obj.medida;
      if (raw != null) {
        n = parseFloat(String(raw).replace(/[^\d.,-]/g, "").replace(",", "."));
      }
    }
    if (n != null && Number.isFinite(n) && n > 0.01) {
      out.push(round2(n));
    }
  }
  return out;
}

function matchTolerance(expected: number): number {
  return Math.max(0.12, expected * 0.03);
}

/**
 * Identifica chanfre somando segmentos de segments_json que não correspondem
 * às 4 medidas principais já salvas no lote.
 */
export function computeChanfreFromBlock(
  block: Record<string, unknown> | null | undefined,
): ChanfreInfo | null {
  if (!block) return null;

  const segmentLengths = parseSegmentLengthsFromJson(block.segments_json);
  if (segmentLengths.length <= 4) {
    const stored = parseBlockSideLength(
      block.chanfre ?? block.chanfro ?? block.Chanfre,
    );
    if (stored && stored > 0) {
      return { total: round2(stored), segments: [round2(stored)] };
    }
    return null;
  }

  const principals = [
    parseBlockSideLength(block.frente ?? block.Frente),
    parseBlockSideLength(block.Fundo ?? block.fundo),
    parseBlockSideLength(
      block["Lado Dir."] ?? block["Lado Dir"] ?? block.lado_direito ?? block.ladoDireito,
    ),
    parseBlockSideLength(
      block["Lado Esq."] ?? block["Lado Esq"] ?? block.lado_esquerdo ?? block.ladoEsquerdo,
    ),
  ].filter((v): v is number => v != null);

  const used = new Set<number>();

  for (const principal of principals) {
    let bestIdx = -1;
    let bestDiff = Infinity;
    for (let i = 0; i < segmentLengths.length; i++) {
      if (used.has(i)) continue;
      const diff = Math.abs(segmentLengths[i] - principal);
      if (diff <= matchTolerance(principal) && diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) used.add(bestIdx);
  }

  let extraSegments = segmentLengths.filter((_, i) => !used.has(i));

  // Fallback: import TXT grava frente/dir/fundo/esq nos 4 primeiros índices
  if (
    extraSegments.length === 0 &&
    principals.length >= 4 &&
    segmentLengths.length > 4
  ) {
    extraSegments = segmentLengths.slice(4);
  }

  if (extraSegments.length === 0) {
    const stored = parseBlockSideLength(
      block.chanfre ?? block.chanfro ?? block.Chanfre,
    );
    if (stored && stored > 0) {
      return { total: round2(stored), segments: [round2(stored)] };
    }
    return null;
  }

  const total = round2(extraSegments.reduce((sum, len) => sum + len, 0));
  if (total <= 0) return null;

  return {
    total,
    segments: extraSegments.map(round2),
  };
}

export function formatChanfreMeters(value: number): string {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} m`;
}

/** Texto de tooltip com medidas individuais do chanfre. */
export function chanfreTooltipText(info: ChanfreInfo): string {
  if (info.segments.length <= 1) {
    return `Chanfre total: ${formatChanfreMeters(info.total)}`;
  }
  const parts = info.segments
    .map((s, i) => `${i + 1}: ${formatChanfreMeters(s)}`)
    .join(" · ");
  return `Chanfre total: ${formatChanfreMeters(info.total)} (${parts})`;
}
