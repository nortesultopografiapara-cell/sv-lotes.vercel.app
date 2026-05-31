/**
 * Memorial descritivo — estrutura para botão "Gerar Memorial" (próxima etapa).
 * Usa segmentos oficiais, confrontações e responsável técnico.
 */

import { getOfficialLotSegmentTable } from "@/lib/officialLotMeasurements";
import { resolveLotSideConfrontants } from "@/lib/lotConfrontations";
import {
  formatMemorialTechnicalBlock,
  normalizeTechnicalResponsible,
} from "@/lib/technicalResponsible";

export type MemorialDraftInput = {
  block: Record<string, unknown>;
  projectId?: string;
  projectBlocks?: Record<string, unknown>[];
  streetGuides?: Record<string, unknown>[];
  technicalResponsible?: Record<string, unknown> | null;
};

/** Texto narrativo base (vértice M-01, frente, laterais, fundo). */
export function buildMemorialDraftPlainText(input: MemorialDraftInput): string {
  const block = input.block;
  const blockId = String(block.id || "");
  const table = getOfficialLotSegmentTable(block);
  const confrontants =
    blockId && input.projectBlocks?.length
      ? resolveLotSideConfrontants(
          block,
          blockId,
          input.projectBlocks,
          input.streetGuides || [],
          undefined,
          input.projectId,
        )
      : {
          frente: String(block.front_street_name || "via de acesso"),
          fundo: "lote vizinho",
          ladoDireito: "lote vizinho",
          ladoEsquerdo: "lote vizinho",
        };

  const startVertex = table.rows[0]?.de || "M-01";
  const lines: string[] = [
    `Inicia-se no vértice ${startVertex}...`,
    `Segue confrontando pela frente com ${confrontants.frente || "via de acesso"}...`,
    `Lado direito confrontando com ${confrontants.ladoDireito || "lote vizinho"}...`,
    `Fundo confrontando com ${confrontants.fundo || "lote vizinho"}...`,
    `Lado esquerdo confrontando com ${confrontants.ladoEsquerdo || "lote vizinho"}...`,
  ];

  const tech = normalizeTechnicalResponsible(
    input.technicalResponsible || null,
  );
  const techHtml = formatMemorialTechnicalBlock(tech);
  return `${lines.join("\n")}\n\n${techHtml.replace(/<[^>]+>/g, " ").trim()}`;
}
