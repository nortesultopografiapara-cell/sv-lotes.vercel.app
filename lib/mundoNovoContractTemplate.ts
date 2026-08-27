/**
 * Template isolado — Chacreamento Mundo Novo.
 * Não altera ARAGUAIA, PADRAO, MENESES, RECANTO_PRIMAVERA nem SV_LOTES_2.
 */

import {
  buildMundoNovoContractContext,
  type MundoNovoContractParams,
} from '@/lib/mundoNovoContractContext';
import {
  buildMundoNovoBodyHtml,
  buildMundoNovoSignaturesHtml,
  buildMundoNovoTitleHtml,
} from '@/lib/mundoNovoContractParties';
import { MUNDO_NOVO_HTML2PDF_PAGINATION_AVOID } from '@/lib/mundoNovoHtml2PdfPagination';
import {
  buildContractA4WidthSafeCss,
  CONTRACT_PDF_CONTENT_WIDTH_PX,
} from '@/lib/contractPaginationEngine';

export { MUNDO_NOVO_HTML2PDF_PAGINATION_AVOID };

export type GenerateMundoNovoContractParams = MundoNovoContractParams;

export function buildMundoNovoContractPaginationCss(): string {
  return `
<style id="mundo-novo-contract-print-css">
${buildContractA4WidthSafeCss('.sv-contract-document.sv-contract-mundo-novo, .sv-contract-mundo-novo')}
.sv-contract-mundo-novo {
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
.sv-contract-mundo-novo .contract-clause {
  page-break-inside: auto;
  break-inside: auto;
  margin-bottom: 12px;
}
.sv-contract-mundo-novo .mundo-novo-clause-keep {
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
  -webkit-column-break-inside: avoid;
}
.sv-contract-mundo-novo .mundo-novo-clause-title {
  page-break-after: avoid !important;
  break-after: avoid-page !important;
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
  orphans: 3;
  widows: 3;
}
.sv-contract-mundo-novo .mundo-novo-clause-lead {
  page-break-before: avoid !important;
  break-before: avoid-page !important;
  orphans: 3;
  widows: 3;
}
.sv-contract-mundo-novo p {
  orphans: 3;
  widows: 3;
}
.sv-contract-mundo-novo .contract-mundo-novo-parties,
.sv-contract-mundo-novo .mundo-novo-parties-lead {
  text-align: left !important;
  text-justify: auto;
  word-spacing: normal !important;
  letter-spacing: normal !important;
}
.sv-contract-mundo-novo .mundo-novo-buyer-qualification {
  word-spacing: normal !important;
  letter-spacing: normal !important;
  overflow-wrap: break-word;
  word-break: break-word;
  white-space: normal;
}
.sv-contract-mundo-novo .contract-closing-and-signatures--mundo-novo {
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
  page-break-before: auto;
  break-before: auto;
  margin-top: 8px;
}
.sv-contract-mundo-novo .mundo-novo-closing-statement {
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
  orphans: 4;
  widows: 4;
}
.sv-contract-mundo-novo .contract-signatures--mundo-novo .signature-grid--mundo-novo {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 28px;
  row-gap: 22px;
  align-items: start;
  justify-items: center;
  width: 100%;
}
.sv-contract-mundo-novo .signature-slot {
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
}
.sv-contract-mundo-novo .signature-slot-vendor-1 { grid-row: 1; grid-column: 1; }
.sv-contract-mundo-novo .signature-slot-vendor-2 { grid-row: 1; grid-column: 2; }
.sv-contract-mundo-novo .signature-slot-buyer { grid-row: 2; grid-column: 1; }
.sv-contract-mundo-novo .signature-slot-intervenient { grid-row: 2; grid-column: 2; }
.sv-contract-mundo-novo .signature-slot-witness-1 { grid-row: 3; grid-column: 1; }
.sv-contract-mundo-novo .signature-slot-witness-2 { grid-row: 3; grid-column: 2; }
.sv-contract-mundo-novo .mundo-novo-keep-together,
.sv-contract-mundo-novo .mundo-novo-financial-item-1-3 {
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
  -webkit-column-break-inside: avoid;
}
.sv-contract-mundo-novo .signature-slot-intervenient,
.sv-contract-mundo-novo .signature-slot-witness-1,
.sv-contract-mundo-novo .signature-slot-witness-2 {
  padding-top: 2px;
  padding-bottom: 10px;
  overflow: visible;
  box-sizing: border-box;
}
.sv-contract-mundo-novo .signature-slot-witness-1 .signature-line,
.sv-contract-mundo-novo .signature-slot-witness-2 .signature-line {
  margin-top: 18px;
}
</style>`;
}

export function generateMundoNovoContract(
  params: GenerateMundoNovoContractParams,
): string {
  const ctx = buildMundoNovoContractContext(params);

  return `
    ${buildMundoNovoContractPaginationCss()}
    <div class="sv-contract-document sv-contract-mundo-novo" data-contract-model="MUNDO_NOVO" style="font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.5; color: #111; background: #fff; padding: 0; margin: 0; width: 100%; max-width: ${CONTRACT_PDF_CONTENT_WIDTH_PX}px; box-sizing: border-box; text-align: justify;">
      ${buildMundoNovoTitleHtml()}
      ${buildMundoNovoBodyHtml(ctx)}
      ${buildMundoNovoSignaturesHtml(ctx)}
    </div>
  `;
}
