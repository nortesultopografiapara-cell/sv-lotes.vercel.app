/**
 * Medidas e confrontações do lote para contrato — mesma fonte da prancha.
 */

import { resolveLotMeasuresFromBlock } from "@/lib/lotChanfre";
import {
  loadManualConfrontants,
  resolveLotSideConfrontants,
  type ManualSideConfrontants,
} from "@/lib/lotConfrontations";
import { getOfficialLotMeasurements } from "@/lib/officialLotMeasurements";
import type { LotSheetSideConfrontants } from "@/lib/lotSheetEnrichment";

export type ContractLotSides = {
  frente: number | string | null;
  fundo: number | string | null;
  ladoDireito: number | string | null;
  ladoEsquerdo: number | string | null;
};

const formatMeasure = (val: unknown): string => {
  if (val === null || val === undefined || val === "") return "não informado";
  const num = Number(val);
  if (!Number.isFinite(num)) return String(val);
  return (
    num.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " m"
  );
};

function formatConfrontantForContract(raw: string): string {
  const v = String(raw || "").trim();
  if (!v || v === "—" || /^não informado$/i.test(v)) {
    return "confrontação pendente";
  }
  return v;
}

export function resolveContractLotSidesAndConfrontants(params: {
  block: Record<string, unknown>;
  projectBlocks?: Record<string, unknown>[] | null;
  streetGuides?: Record<string, unknown>[] | null;
  manualConfrontants?: ManualSideConfrontants | null;
}): { sides: ContractLotSides; confrontants: LotSheetSideConfrontants } {
  const block = params.block;
  let sides: ContractLotSides = {
    frente: null,
    fundo: null,
    ladoDireito: null,
    ladoEsquerdo: null,
  };

  const segs = block.segments;
  if (Array.isArray(segs) && segs.length > 0) {
    try {
      const official = getOfficialLotMeasurements(block);
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

  const fallback = resolveLotMeasuresFromBlock(block);
  sides = {
    frente: sides.frente ?? fallback.sides.frente ?? block.frente ?? null,
    fundo: sides.fundo ?? fallback.sides.fundo ?? block.fundo ?? null,
    ladoDireito:
      sides.ladoDireito ??
      fallback.sides.ladoDireito ??
      block["Lado Dir."] ??
      null,
    ladoEsquerdo:
      sides.ladoEsquerdo ??
      fallback.sides.ladoEsquerdo ??
      block["Lado Esq."] ??
      null,
  };

  const blockId = String(block.id || "").trim();
  let confrontants: LotSheetSideConfrontants = {
    frente: "",
    fundo: "",
    ladoDireito: "",
    ladoEsquerdo: "",
  };

  if (blockId && params.projectBlocks?.length) {
    const manual =
      params.manualConfrontants ??
      (typeof window !== "undefined"
        ? loadManualConfrontants(blockId)
        : null);
    confrontants = resolveLotSideConfrontants(
      block,
      blockId,
      params.projectBlocks,
      params.streetGuides || [],
      manual,
    );
  }

  return { sides, confrontants };
}

function formatBoundaryPart(
  label: string,
  measure: unknown,
  confrontant: string,
): string {
  const m = formatMeasure(measure);
  const c = formatConfrontantForContract(confrontant);
  return `${label}: <strong>${m}</strong> confrontando com <strong>${c}</strong>`;
}

/** Texto da Cláusula Primeira com medidas + confrontações. */
export function formatContractLotBoundariesClause(params: {
  block: Record<string, unknown>;
  projectBlocks?: Record<string, unknown>[] | null;
  streetGuides?: Record<string, unknown>[] | null;
  manualConfrontants?: ManualSideConfrontants | null;
}): string {
  const { sides, confrontants } = resolveContractLotSidesAndConfrontants(
    params,
  );
  return [
    formatBoundaryPart("Frente", sides.frente, confrontants.frente),
    formatBoundaryPart("Fundo", sides.fundo, confrontants.fundo),
    formatBoundaryPart(
      "Lado Direito",
      sides.ladoDireito,
      confrontants.ladoDireito,
    ),
    formatBoundaryPart(
      "Lado Esquerdo",
      sides.ladoEsquerdo,
      confrontants.ladoEsquerdo,
    ),
  ].join("; ");
}
