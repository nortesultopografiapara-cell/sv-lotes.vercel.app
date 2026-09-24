/**
 * Template isolado — Chacreamento Estrela do Sul.
 * Não altera PADRAO, MENESES, RECANTO_PRIMAVERA, SV_LOTES_2, ARAGUAIA nem MUNDO_NOVO.
 */

import {
  buildEstrelaDoSulContractContext,
  type EstrelaDoSulContractParams,
} from '@/lib/estrelaDoSulContractContext';
import { buildEstrelaDoSulClausesHtml } from '@/lib/estrelaDoSulContractClauses';
import {
  buildEstrelaDoSulAnnexHtml,
  buildEstrelaDoSulCapaHtml,
  buildEstrelaDoSulPreambleHtml,
  buildEstrelaDoSulSignaturesHtml,
} from '@/lib/estrelaDoSulContractParties';
import {
  buildContractA4WidthSafeCss,
  CONTRACT_PDF_CONTENT_WIDTH_PX,
} from '@/lib/contractPaginationEngine';

export type GenerateEstrelaDoSulContractParams = EstrelaDoSulContractParams;

export const ESTRELA_DO_SUL_HTML2PDF_PAGINATION_AVOID = [
  '.contract-closing-and-signatures--estrela',
  '.signature-slot',
  '.estrela-clause-keep',
];

export function buildEstrelaDoSulContractPaginationCss(): string {
  return `
<style id="estrela-do-sul-contract-print-css">
${buildContractA4WidthSafeCss('.sv-contract-document.sv-contract-estrela-do-sul, .sv-contract-estrela-do-sul')}
.sv-contract-estrela-do-sul {
  font-family: 'Times New Roman', Times, serif;
  font-size: 12pt;
  line-height: 1.5;
  color: #111;
  background: #fff;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  text-align: justify;
}
.sv-contract-estrela-do-sul .contract-clause {
  page-break-inside: auto;
  break-inside: auto;
  margin-bottom: 12px;
}
.sv-contract-estrela-do-sul .estrela-clause-title {
  page-break-after: avoid !important;
  break-after: avoid-page !important;
}
.sv-contract-estrela-do-sul .estrela-clause-keep {
  page-break-inside: avoid;
  break-inside: avoid-page;
}
.sv-contract-estrela-do-sul .contract-closing-and-signatures--estrela {
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
  margin-top: 8px;
}
.sv-contract-estrela-do-sul .signature-grid--estrela {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 28px;
  row-gap: 22px;
  align-items: start;
  justify-items: center;
  width: 100%;
}
.sv-contract-estrela-do-sul .signature-slot {
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
}
.sv-contract-estrela-do-sul .signature-slot-buyer { grid-column: 1; }
.sv-contract-estrela-do-sul .signature-slot-vendor-1 { grid-column: 2; }
</style>`;
}

export function generateEstrelaDoSulContract(
  params: GenerateEstrelaDoSulContractParams,
): string {
  const ctx = buildEstrelaDoSulContractContext(params);
  return `
    ${buildEstrelaDoSulContractPaginationCss()}
    <div class="sv-contract-document sv-contract-estrela-do-sul" data-contract-model="ESTRELA_DO_SUL" style="font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.5; color: #111; background: #fff; padding: 0; margin: 0; width: 100%; max-width: ${CONTRACT_PDF_CONTENT_WIDTH_PX}px; box-sizing: border-box; text-align: justify;">
      ${buildEstrelaDoSulCapaHtml(ctx)}
      ${buildEstrelaDoSulPreambleHtml(ctx)}
      ${buildEstrelaDoSulClausesHtml(ctx)}
      ${buildEstrelaDoSulAnnexHtml(ctx)}
      ${buildEstrelaDoSulSignaturesHtml(ctx)}
    </div>
  `;
}
