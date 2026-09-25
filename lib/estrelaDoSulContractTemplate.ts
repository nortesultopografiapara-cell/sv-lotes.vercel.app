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
.sv-contract-estrela-do-sul .estrela-capa {
  font-size: 9pt;
  line-height: 1.22;
}
.sv-contract-estrela-do-sul .estrela-capa h2 {
  font-size: 11pt !important;
  margin: 0 0 2px 0 !important;
  line-height: 1.2 !important;
}
.sv-contract-estrela-do-sul .estrela-capa h3 {
  font-size: 10pt !important;
  margin: 0 0 3px 0 !important;
  line-height: 1.2 !important;
}
.sv-contract-estrela-do-sul .estrela-capa .estrela-table {
  font-size: 9pt !important;
  margin: 6px 0 10px 0 !important;
  position: relative;
  z-index: 0;
}
.sv-contract-estrela-do-sul .estrela-capa .estrela-section-title {
  display: block !important;
  font-size: 9pt !important;
  margin: 10px 0 0 0 !important;
  padding: 0 0 6px 0 !important;
  line-height: 1.25 !important;
  page-break-after: avoid !important;
  break-after: avoid-page !important;
  position: relative;
  z-index: 1;
}
.sv-contract-estrela-do-sul .estrela-capa .estrela-table th,
.sv-contract-estrela-do-sul .estrela-capa .estrela-table td {
  padding-top: 6px !important;
  padding-bottom: 6px !important;
  padding-left: 6px !important;
  padding-right: 6px !important;
  line-height: 1.4 !important;
  font-size: 9pt !important;
  vertical-align: middle !important;
  height: auto !important;
}
.sv-contract-estrela-do-sul .estrela-capa .estrela-footnote {
  font-size: 8pt !important;
  margin: 0 0 3px 0 !important;
  line-height: 1.2 !important;
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
.sv-contract-estrela-do-sul .estrela-table th,
.sv-contract-estrela-do-sul .estrela-table td {
  padding-top: 5px !important;
  padding-bottom: 5px !important;
  padding-left: 5px !important;
  padding-right: 5px !important;
  vertical-align: middle !important;
  line-height: 1.3 !important;
}
.sv-contract-estrela-do-sul .estrela-td-keep {
  line-height: 1.3 !important;
  margin: 0;
  padding: 0;
  overflow: visible !important;
}
.sv-contract-estrela-do-sul .estrela-capa .estrela-td-keep {
  line-height: 1.4 !important;
}
.sv-contract-estrela-do-sul .estrela-footnote,
.sv-contract-estrela-do-sul .estrela-capa p[style*="font-size:9pt"] {
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
}
.sv-contract-estrela-do-sul .estrela-capa-section-4-title {
  page-break-after: avoid !important;
  break-after: avoid-page !important;
  font-size: 9pt !important;
  margin: 0 0 4px 0 !important;
  line-height: 1.25 !important;
}
.sv-contract-estrela-do-sul .estrela-capa-annex-table {
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
}
.sv-contract-estrela-do-sul .estrela-capa .estrela-capa-annex-table .estrela-table {
  margin: 2px 0 10px 0 !important;
}
.sv-contract-estrela-do-sul .estrela-capa-signatures {
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
  page-break-before: avoid !important;
  break-before: avoid-page !important;
  margin-top: 8px;
}
.sv-contract-estrela-do-sul .estrela-capa-signatures .contract-signatures {
  page-break-inside: auto !important;
  break-inside: auto !important;
  page-break-before: avoid !important;
  break-before: avoid-page !important;
  margin-top: 0 !important;
}
.sv-contract-estrela-do-sul .estrela-capa-signatures .contract-closing-date {
  margin-top: 4px !important;
  margin-bottom: 0 !important;
  padding-bottom: 8px !important;
  font-size: 9pt !important;
  line-height: 1.35 !important;
  page-break-after: avoid !important;
  break-after: avoid-page !important;
}
.sv-contract-estrela-do-sul .estrela-capa-signatures .signature-grid--estrela {
  row-gap: 14px !important;
  column-gap: 24px !important;
  padding-top: 2px !important;
}
.sv-contract-estrela-do-sul .estrela-capa-signatures .signature-line {
  display: block !important;
  margin: 0 auto 6px auto !important;
  padding: 0 !important;
  height: 1px !important;
  border: 0 !important;
  border-top: 1px solid #111 !important;
  background: transparent !important;
  box-sizing: border-box !important;
}
.sv-contract-estrela-do-sul .estrela-capa-signatures .estrela-sign-slot,
.sv-contract-estrela-do-sul .estrela-capa-signatures .signature-slot {
  margin-bottom: 0 !important;
}
.sv-contract-estrela-do-sul .estrela-capa-signatures p {
  font-size: 9pt !important;
  line-height: 1.3 !important;
}
.sv-contract-estrela-do-sul .estrela-capa-signatures p[style*="text-transform: uppercase"] {
  margin: 4px 0 2px 0 !important;
}
.sv-contract-estrela-do-sul .estrela-capa-signatures p[style*="font-weight: bold"]:not([style*="text-transform: uppercase"]) {
  margin: 1px 0 1px 0 !important;
}
.sv-contract-estrela-do-sul .estrela-capa-signatures .estrela-sign-doc {
  margin: 0 !important;
  padding-bottom: 2px !important;
}
.sv-contract-estrela-do-sul .estrela-instrument {
  page-break-before: always !important;
  break-before: page !important;
}
.sv-contract-estrela-do-sul .contract-closing-and-signatures--estrela {
  page-break-inside: auto !important;
  break-inside: auto !important;
  page-break-before: auto !important;
  break-before: auto !important;
  min-height: 0 !important;
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
  page-break-inside: auto !important;
  break-inside: auto !important;
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
  overflow: visible !important;
}
.sv-contract-estrela-do-sul .signature-slot-buyer { grid-column: 1; }
.sv-contract-estrela-do-sul .signature-slot-vendor-1 { grid-column: 2; }
.sv-contract-estrela-do-sul .signature-slot-witness-1 { grid-column: 1; }
.sv-contract-estrela-do-sul .signature-slot-witness-2 { grid-column: 2; }
.sv-contract-estrela-do-sul .signature-grid--estrela .estrela-sign-doc {
  white-space: nowrap !important;
  overflow: visible !important;
  overflow-wrap: normal !important;
  word-break: keep-all !important;
  line-height: 1.35 !important;
  padding-top: 1px;
  padding-bottom: 2px;
}
.sv-contract-estrela-do-sul .sv-esign-stamp {
  margin: 0 0 2px 0 !important;
  font-size: 7pt !important;
  line-height: 1.12 !important;
  font-weight: 700 !important;
  color: #166534 !important;
}
.sv-contract-estrela-do-sul .contract-closing-and-signatures--estrela:has(.sv-esign-stamp) {
  page-break-inside: auto !important;
  break-inside: auto !important;
  min-height: 0 !important;
  page-break-before: auto !important;
  break-before: auto !important;
}
.sv-contract-estrela-do-sul .contract-closing-and-signatures--estrela:has(.sv-esign-stamp) .contract-signatures,
.sv-contract-estrela-do-sul .contract-closing-and-signatures--estrela:has(.sv-esign-stamp) .signature-grid--estrela {
  page-break-inside: auto !important;
  break-inside: auto !important;
  page-break-before: auto !important;
  break-before: auto !important;
  min-height: 0 !important;
  row-gap: 10px !important;
}
.sv-contract-estrela-do-sul .contract-closing-and-signatures--estrela:has(.sv-esign-stamp) .contract-closing-date {
  margin-bottom: 8px !important;
  padding-bottom: 0 !important;
}
.sv-contract-estrela-do-sul .contract-closing-and-signatures--estrela:has(.sv-esign-stamp) .signature-line {
  margin: 0 auto 8px auto !important;
  height: 1px !important;
}
.sv-contract-estrela-do-sul .contract-closing-and-signatures--estrela:has(.sv-esign-stamp) .signature-slot {
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
  min-height: 0 !important;
}
.sv-contract-estrela-do-sul .estrela-capa-signatures:has(.sv-esign-stamp) {
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
  page-break-before: avoid !important;
  break-before: avoid-page !important;
}
.sv-contract-estrela-do-sul .estrela-capa-signatures:has(.sv-esign-stamp) .signature-grid--estrela {
  row-gap: 10px !important;
  padding-top: 0 !important;
}
.sv-contract-estrela-do-sul .estrela-capa-signatures:has(.sv-esign-stamp) .contract-closing-date {
  padding-bottom: 4px !important;
}
.sv-contract-estrela-do-sul .estrela-capa-signatures:has(.sv-esign-stamp) .signature-line {
  margin: 0 auto 4px auto !important;
  height: 1px !important;
}
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
