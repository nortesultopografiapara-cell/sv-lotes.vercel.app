import { pickBlockSideRaw } from '@/lib/blockLotNormalize';
import {
  getOfficialLotMeasurements,
  type OfficialLotCurveInfo,
} from '@/lib/officialLotMeasurements';

/**
 * Chanfre e medidas de lados do lote.
 * Medidas oficiais (frente/fundo/laterais) preferem getOfficialLotMeasurements,
 * que soma todos os segmentos da mesma confrontação.
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
  curva: OfficialLotCurveInfo | null;
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

/**
 * Lê um comprimento de segmento a partir de valor bruto.
 * Aceita number ou string numérica ("16,58" / "16.58"); rejeita NaN/≤0.
 */
export function parsePositiveSegmentLength(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw > 0.01 ? round2(raw) : null;
  }
  if (typeof raw === "string") {
    const cleaned = raw.replace(/[^\d.,-]/g, "").replace(",", ".");
    if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === ",") {
      return null;
    }
    const n = parseFloat(cleaned);
    return Number.isFinite(n) && n > 0.01 ? round2(n) : null;
  }
  return null;
}

/**
 * Extrai comprimentos válidos de segments_json.
 * Prioridade em objetos: distance → Distance → length → Length → storedLength → comprimento → medida.
 * (Civil 3D / TXT oficial usa `distance`; `length` é legado geo.)
 */
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
    if (typeof item === "number" || typeof item === "string") {
      n = parsePositiveSegmentLength(item);
    } else if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      const raw =
        obj.distance ??
        obj.Distance ??
        obj.length ??
        obj.Length ??
        obj.storedLength ??
        obj.comprimento ??
        obj.medida;
      n = parsePositiveSegmentLength(raw);
    }
    if (n != null) out.push(n);
  }
  return out;
}

function getColumnTargets(block: Record<string, unknown>): LotSideMeasures {
  return {
    frente: parseBlockSideLength(pickBlockSideRaw(block, 'frente')),
    fundo: parseBlockSideLength(pickBlockSideRaw(block, 'fundo')),
    ladoDireito: parseBlockSideLength(pickBlockSideRaw(block, 'ladoDireito')),
    ladoEsquerdo: parseBlockSideLength(pickBlockSideRaw(block, 'ladoEsquerdo')),
  };
}

/**
 * Chanfre: segmentos extras curtos (1–15 m) além dos lados oficiais.
 * Medidas de frente/fundo/laterais vêm de getOfficialLotMeasurements (soma por confrontação).
 * Este fallback legado NÃO escolhe mais 1 segmento por lado (subestimava multi-segmento).
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
  ].filter((t): t is number => t != null && Number.isFinite(t));

  const used = new Set<number>();
  for (const target of targets) {
    let bestIdx = -1;
    let bestDiff = Infinity;
    for (let i = 0; i < segmentLengths.length; i++) {
      if (used.has(i)) continue;
      const diff = Math.abs(segmentLengths[i] - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestDiff <= Math.max(target * 0.08, 0.15)) {
      used.add(bestIdx);
    }
  }

  const chanfreSegments = segmentLengths.filter((_, i) => !used.has(i));

  /** Mantém colunas (fonte persistida) — não substituir por um único segmento. */
  const sides: LotSideMeasures = { ...columnTargets };

  if (chanfreSegments.length === 0) {
    return { sides, chanfre: null, curva: null };
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
    curva: null,
  };
  if (!block) return empty;

  const isTxtOfficial =
    block.source_import === 'TXT_CIVIL3D' ||
    (Array.isArray(block.segments_json) &&
      block.segments_json.some(
        (s) =>
          s != null &&
          typeof s === 'object' &&
          ('segment_index' in (s as object) || 'distance' in (s as object)),
      ));

  if (isTxtOfficial) {
    const official = getOfficialLotMeasurements(block);
    if (official.source === 'txt_segments') {
      return {
        sides: {
          frente: official.frente,
          fundo: official.fundo,
          ladoDireito: official.ladoDireito,
          ladoEsquerdo: official.ladoEsquerdo,
        },
        chanfre: official.chanfre,
        curva: official.curva,
      };
    }
  }

  const columnTargets = getColumnTargets(block);
  const segmentLengths = parseSegmentLengthsFromJson(block.segments_json);

  if (segmentLengths.length === 0) {
    return { sides: columnTargets, chanfre: null, curva: null };
  }

  if (segmentLengths.length <= 4) {
    return { sides: columnTargets, chanfre: null, curva: null };
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
