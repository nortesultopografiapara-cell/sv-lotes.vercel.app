/**
 * Chanfre: segmentos extras quando há mais de 4 lados em segments_json.
 * Cada lado oficial recebe exatamente 1 segmento; o restante é chanfre (sem somar no lado).
 */

export type ChanfreInfo = {
  total: number;
  segments: number[];
};

export type LotSideMeasures = {
  frente: number | null;
  fundo: number | null;
  ladoDireito: number | null;
  ladoEsquerdo: number | null;
};

export type LotMeasuresResult = {
  sides: LotSideMeasures;
  chanfre: ChanfreInfo | null;
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

function getColumnTargets(block: Record<string, unknown>): LotSideMeasures {
  return {
    frente: parseBlockSideLength(block.frente ?? block.Frente),
    fundo: parseBlockSideLength(block.Fundo ?? block.fundo),
    ladoDireito: parseBlockSideLength(
      block["Lado Dir."] ??
        block["Lado Dir"] ??
        block.lado_direito ??
        block.ladoDireito,
    ),
    ladoEsquerdo: parseBlockSideLength(
      block["Lado Esq."] ??
        block["Lado Esq"] ??
        block.lado_esquerdo ??
        block.ladoEsquerdo,
    ),
  };
}

/** Combinações de k índices entre 0..n-1 */
function combinations(n: number, k: number): number[][] {
  const result: number[][] = [];
  const combo: number[] = [];

  function backtrack(start: number) {
    if (combo.length === k) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i <= n - (k - combo.length); i++) {
      combo.push(i);
      backtrack(i + 1);
      combo.pop();
    }
  }

  backtrack(0);
  return result;
}

/** Permutações de um array (atribuição lado ↔ segmento) */
function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const head = arr[i];
    const rest = permutations(arr.filter((_, j) => j !== i));
    for (const p of rest) out.push([head, ...p]);
  }
  return out;
}

/**
 * >4 segmentos: escolhe 4 segmentos (1 por lado) minimizando diferença às colunas;
 * segmentos não escolhidos = chanfre.
 */
function resolveWithExtraSegments(
  segmentLengths: number[],
  columnTargets: LotSideMeasures,
): LotMeasuresResult {
  const targets = [
    columnTargets.frente,
    columnTargets.fundo,
    columnTargets.ladoDireito,
    columnTargets.ladoEsquerdo,
  ];

  const n = segmentLengths.length;
  let bestCost = Infinity;
  let bestPerm: number[] | null = null;
  let bestCombo: number[] | null = null;

  for (const combo of combinations(n, 4)) {
    for (const perm of permutations(combo)) {
      let cost = 0;
      for (let s = 0; s < 4; s++) {
        const target = targets[s];
        if (target == null) continue;
        cost += Math.abs(segmentLengths[perm[s]] - target);
      }
      if (cost < bestCost) {
        bestCost = cost;
        bestPerm = perm;
        bestCombo = combo;
      }
    }
  }

  if (!bestPerm || !bestCombo) {
    return { sides: columnTargets, chanfre: null };
  }

  const used = new Set(bestCombo);
  const chanfreSegments = segmentLengths.filter((_, i) => !used.has(i));

  const sides: LotSideMeasures = {
    frente: round2(segmentLengths[bestPerm[0]]),
    fundo: round2(segmentLengths[bestPerm[1]]),
    ladoDireito: round2(segmentLengths[bestPerm[2]]),
    ladoEsquerdo: round2(segmentLengths[bestPerm[3]]),
  };

  if (chanfreSegments.length === 0) {
    return { sides, chanfre: null };
  }

  const total = round2(chanfreSegments.reduce((sum, len) => sum + len, 0));
  return {
    sides,
    chanfre: {
      total,
      segments: chanfreSegments.map(round2),
    },
  };
}

/** Medidas do lote + chanfre (fonte única para mapa e contrato). */
export function resolveLotMeasuresFromBlock(
  block: Record<string, unknown> | null | undefined,
): LotMeasuresResult {
  const empty: LotMeasuresResult = {
    sides: { frente: null, fundo: null, ladoDireito: null, ladoEsquerdo: null },
    chanfre: null,
  };
  if (!block) return empty;

  const columnTargets = getColumnTargets(block);
  const segmentLengths = parseSegmentLengthsFromJson(block.segments_json);

  if (segmentLengths.length === 0) {
    return { sides: columnTargets, chanfre: null };
  }

  if (segmentLengths.length <= 4) {
    return { sides: columnTargets, chanfre: null };
  }

  return resolveWithExtraSegments(segmentLengths, columnTargets);
}

/** Compatibilidade: só retorna chanfre quando houver segmentos extras. */
export function computeChanfreFromBlock(
  block: Record<string, unknown> | null | undefined,
): ChanfreInfo | null {
  return resolveLotMeasuresFromBlock(block).chanfre;
}

export function formatChanfreMeters(value: number): string {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} m`;
}

export function formatChanfreClause(chanfre: ChanfreInfo): string {
  if (chanfre.segments.length === 1) {
    return `, chanfre <strong>${formatChanfreMeters(chanfre.segments[0])}</strong>`;
  }
  const parts = chanfre.segments.map((s) => formatChanfreMeters(s)).join(", ");
  return `, chanfre <strong>${parts}</strong>`;
}

/** Texto de tooltip com medidas individuais do chanfre. */
export function chanfreTooltipText(info: ChanfreInfo): string {
  if (info.segments.length <= 1) {
    return `Chanfre: ${formatChanfreMeters(info.total)}`;
  }
  const parts = info.segments
    .map((s, i) => `${i + 1}: ${formatChanfreMeters(s)}`)
    .join(" · ");
  return `Chanfre: ${formatChanfreMeters(info.total)} (${parts})`;
}
