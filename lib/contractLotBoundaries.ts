/**
 * Medidas do lote para contrato — somente dimensões (sem confrontações).
 * Confrontações permanecem em memorial, prancha, GIS e relatórios técnicos.
 */

import {
  formatChanfreMeters,
  resolveLotMeasuresFromBlock,
  type ChanfreInfo,
} from '@/lib/lotChanfre';
import { getOfficialLotMeasurements } from '@/lib/officialLotMeasurements';

export type ContractLotSides = {
  frente: number | string | null;
  fundo: number | string | null;
  ladoDireito: number | string | null;
  ladoEsquerdo: number | string | null;
};

const formatMeasure = (val: unknown): string => {
  if (val === null || val === undefined || val === '') return 'não informado';
  const num = Number(val);
  if (!Number.isFinite(num)) return String(val);
  return (
    num.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' m'
  );
};

/** Medidas oficiais do lote para cláusula contratual (sem vizinhos/ruas). */
export function resolveContractLotSides(
  block: Record<string, unknown> | null | undefined,
): ContractLotSides {
  const b = block ?? {};
  let sides: ContractLotSides = {
    frente: null,
    fundo: null,
    ladoDireito: null,
    ladoEsquerdo: null,
  };

  const segs = b.segments;
  if (Array.isArray(segs) && segs.length > 0) {
    try {
      const official = getOfficialLotMeasurements(b);
      sides = {
        frente: official.frente,
        fundo: official.fundo,
        ladoDireito: official.ladoDireito,
        ladoEsquerdo: official.ladoEsquerdo,
      };
    } catch {
      /* fallback abaixo */
    }
  }

  const fallback = resolveLotMeasuresFromBlock(b);
  return {
    frente: sides.frente ?? fallback.sides.frente ?? b.frente ?? null,
    fundo: sides.fundo ?? fallback.sides.fundo ?? b.fundo ?? null,
    ladoDireito:
      sides.ladoDireito ??
      fallback.sides.ladoDireito ??
      b['Lado Dir.'] ??
      null,
    ladoEsquerdo:
      sides.ladoEsquerdo ??
      fallback.sides.ladoEsquerdo ??
      b['Lado Esq.'] ??
      null,
  };
}

function formatBoundaryPart(label: string, measure: unknown): string {
  return `${label}: <strong>${formatMeasure(measure)}</strong>`;
}

function formatChanfrePart(chanfre: ChanfreInfo): string | null {
  if (!chanfre || chanfre.total <= 0 || !chanfre.segments.length) {
    return null;
  }
  if (chanfre.segments.length === 1) {
    return `Chanfre: <strong>${formatChanfreMeters(chanfre.segments[0])}</strong>`;
  }
  const parts = chanfre.segments.map((s) => formatChanfreMeters(s)).join(', ');
  return `Chanfre: <strong>${parts}</strong>`;
}

/**
 * Cláusula Primeira — medidas lineares (e chanfre, se houver), sem confrontações.
 * Ex.: medindo: Frente: 10,00 m; Fundo: 10,00 m; ...
 */
export function formatContractLotBoundariesClause(params: {
  block: Record<string, unknown>;
}): string {
  const block = params.block ?? {};
  const sides = resolveContractLotSides(block);
  const { chanfre } = resolveLotMeasuresFromBlock(block);

  const parts = [
    formatBoundaryPart('Frente', sides.frente),
    formatBoundaryPart('Fundo', sides.fundo),
    formatBoundaryPart('Lado Direito', sides.ladoDireito),
    formatBoundaryPart('Lado Esquerdo', sides.ladoEsquerdo),
  ];

  const chanfrePart = chanfre ? formatChanfrePart(chanfre) : null;
  if (chanfrePart) parts.push(chanfrePart);

  return `medindo: ${parts.join('; ')}.`;
}
