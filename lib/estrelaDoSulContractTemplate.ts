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
  buildEstrelaDoSulCapaHtml,
  buildEstrelaDoSulPreambleHtml,
  buildEstrelaDoSulSignaturesHtml,
} from '@/lib/estrelaDoSulContractParties';
import {
  buildContractA4WidthSafeCss,
  CONTRACT_PDF_CONTENT_WIDTH_PX,
} from '@/lib/contractPaginationEngine';

export type GenerateEstrelaDoSulContractParams = EstrelaDoSulContractParams;

export { ESTRELA_DO_SUL_HTML2PDF_PAGINATION_AVOID } from '@/lib/estrelaDoSulHtml2PdfPagination';

export function buildEstrelaDoSulContractPaginationCss(): string {
  return `
<style id="estrela-do-sul-contract-print-css">
${buildContractA4WidthSafeCss('.sv-contract-document.sv-contract-estrela-do-sul, .sv-contract-estrela-do-sul')}
.sv-contract-estrela-do-sul {
  font-family: 'Times New Roman', Times, serif;
  font-size: 11pt;
  line-height: 1.35;
  color: #111;
  background: #fff;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  text-align: justify;
}
.sv-contract-estrela-do-sul .estrela-logo {
  display: none !important;
}
.sv-contract-estrela-do-sul .contract-clause {
  page-break-inside: auto;
  break-inside: auto;
  margin-bottom: 8px;
}
.sv-contract-estrela-do-sul p,
.sv-contract-estrela-do-sul .estrela-item-p {
  orphans: 3;
  widows: 3;
}
.sv-contract-estrela-do-sul .estrela-item {
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
  -webkit-column-break-inside: avoid !important;
}
.sv-contract-estrela-do-sul .estrela-item--long {
  page-break-inside: auto !important;
  break-inside: auto !important;
  orphans: 3;
  widows: 3;
}
.sv-contract-estrela-do-sul .estrela-clause-title,
.sv-contract-estrela-do-sul .estrela-section-title {
  page-break-after: avoid !important;
  break-after: avoid-page !important;
}
.sv-contract-estrela-do-sul .estrela-clause-head,
.sv-contract-estrela-do-sul .estrela-clause-keep {
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
}
.sv-contract-estrela-do-sul .estrela-item-group {
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
}
.sv-contract-estrela-do-sul .estrela-lead-table {
  page-break-inside: auto;
  break-inside: auto;
}
.sv-contract-estrela-do-sul .estrela-lead-table > .estrela-item,
.sv-contract-estrela-do-sul .estrela-lead-table > .estrela-section-title {
  page-break-after: avoid !important;
  break-after: avoid-page !important;
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
}
.sv-contract-estrela-do-sul .estrela-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 10.5pt;
  margin: 4px 0 8px 0;
  page-break-inside: auto;
  break-inside: auto;
}
.sv-contract-estrela-do-sul .estrela-object-table col.estrela-col-info {
  width: 33%;
}
.sv-contract-estrela-do-sul .estrela-object-table col.estrela-col-detail {
  width: 67%;
}
.sv-contract-estrela-do-sul .estrela-capa .estrela-table {
  margin: 2px 0 6px 0;
}
.sv-contract-estrela-do-sul .estrela-capa .estrela-section-title {
  margin: 0 0 4px 0;
}
.sv-contract-estrela-do-sul .estrela-table thead {
  display: table-header-group;
}
.sv-contract-estrela-do-sul .estrela-table tbody {
  display: table-row-group;
}
.sv-contract-estrela-do-sul .estrela-table tr,
.sv-contract-estrela-do-sul .estrela-table td,
.sv-contract-estrela-do-sul .estrela-table th,
.sv-contract-estrela-do-sul .estrela-td-keep {
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
  -webkit-column-break-inside: avoid !important;
  overflow: visible !important;
}
.sv-contract-estrela-do-sul .estrela-footnote,
.sv-contract-estrela-do-sul .estrela-capa p[style*="font-size:9pt"] {
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
}
.sv-contract-estrela-do-sul .estrela-capa-section-4-title {
  page-break-after: avoid !important;
  break-after: avoid-page !important;
}
.sv-contract-estrela-do-sul .estrela-capa-annex-table {
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
}
.sv-contract-estrela-do-sul .estrela-capa-signatures {
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
  page-break-before: avoid;
  margin-top: 4px;
}
.sv-contract-estrela-do-sul .estrela-instrument {
  page-break-before: always !important;
  break-before: page !important;
}
.sv-contract-estrela-do-sul .contract-closing-and-signatures--estrela {
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
  margin-top: 8px;
}
.sv-contract-estrela-do-sul .signature-grid--estrela {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 24px;
  row-gap: 16px;
  align-items: start;
  justify-items: center;
  width: 100%;
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
}
.sv-contract-estrela-do-sul .contract-closing-date {
  page-break-after: avoid !important;
  break-after: avoid-page !important;
  margin-bottom: 14px;
}
.sv-contract-estrela-do-sul .signature-slot,
.sv-contract-estrela-do-sul .estrela-sign-slot {
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
    <div class="sv-contract-document sv-contract-estrela-do-sul" data-contract-model="ESTRELA_DO_SUL" style="font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.35; color: #111; background: #fff; padding: 0; margin: 0; width: 100%; max-width: ${CONTRACT_PDF_CONTENT_WIDTH_PX}px; box-sizing: border-box; text-align: justify;">
      ${buildEstrelaDoSulCapaHtml(ctx)}
      <div class="estrela-instrument">
        ${buildEstrelaDoSulPreambleHtml(ctx)}
        ${buildEstrelaDoSulClausesHtml(ctx)}
        ${buildEstrelaDoSulSignaturesHtml(ctx, 'instrumento')}
      </div>
    </div>
  `;
}
