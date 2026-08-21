/**
 * Template isolado — Chacreamento Araguaia (R R NEGÓCIOS).
 * Não altera PADRAO, MENESES, RECANTO_PRIMAVERA, SV_LOTES_2.
 */

import {
  buildAraguaiaContractContext,
  type AraguaiaContractParams,
} from '@/lib/araguaiaContractContext';
import {
  buildAraguaiaBodyHtml,
  buildAraguaiaSignaturesHtml,
  buildAraguaiaTitleHtml,
} from '@/lib/araguaiaContractParties';
import {
  buildContractA4WidthSafeCss,
  CONTRACT_PDF_CONTENT_WIDTH_PX,
} from '@/lib/contractPaginationEngine';

export type GenerateAraguaiaContractParams = AraguaiaContractParams;

/** CSS embutido exclusivo do Araguaia — não modifica CSS Recanto/clássico. */
export function buildAraguaiaContractPaginationCss(): string {
  return `
<style id="araguaia-contract-print-css">
${buildContractA4WidthSafeCss('.sv-contract-document.sv-contract-araguaia, .sv-contract-araguaia')}
.sv-contract-araguaia {
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
.sv-contract-araguaia .contract-clause {
  page-break-inside: auto;
  break-inside: auto;
  margin-bottom: 12px;
}
/* Título + 1º parágrafo: nunca separar / cortar no rodapé */
.sv-contract-araguaia .araguaia-clause-keep {
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
  -webkit-column-break-inside: avoid;
}
.sv-contract-araguaia .araguaia-clause-title {
  page-break-after: avoid !important;
  break-after: avoid-page !important;
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
  orphans: 3;
  widows: 3;
}
.sv-contract-araguaia .araguaia-clause-lead {
  page-break-before: avoid !important;
  break-before: avoid-page !important;
  orphans: 3;
  widows: 3;
}
.sv-contract-araguaia p {
  orphans: 3;
  widows: 3;
}
/* Fecho + data + assinaturas: unidade indivisível.
 * Quebra antecipada (force-break) só se altura > página útil (measure).
 * NÃO forçar por y%PAGE_H — evita página quase vazia antes do pack. */
.sv-contract-araguaia .contract-closing-and-signatures--araguaia {
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
  page-break-before: auto;
  break-before: auto;
  margin-top: 8px;
}
.sv-contract-araguaia .contract-closing-and-signatures--araguaia.sv-pagination-force-break {
  page-break-before: always !important;
  break-before: page !important;
}
.sv-contract-araguaia .araguaia-closing-statement {
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
  orphans: 4;
  widows: 4;
}
.sv-contract-araguaia .contract-closing-and-signatures--araguaia .contract-closing,
.sv-contract-araguaia .contract-closing-and-signatures--araguaia .contract-closing-date,
.sv-contract-araguaia .contract-closing-and-signatures--araguaia .contract-signatures--araguaia {
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
  page-break-before: avoid !important;
  break-before: avoid-page !important;
}
.sv-contract-araguaia .contract-signatures--araguaia .signature-grid--araguaia {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 28px;
  row-gap: 22px;
  align-items: start;
  justify-items: center;
  width: 100%;
}
.sv-contract-araguaia .signature-slot {
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
}
.sv-contract-araguaia .signature-slot-vendor-1 { grid-row: 1; grid-column: 1; }
.sv-contract-araguaia .signature-slot-vendor-2 { grid-row: 1; grid-column: 2; }
.sv-contract-araguaia .signature-slot-buyer { grid-row: 2; grid-column: 1; }
.sv-contract-araguaia .signature-slot-intervenient { grid-row: 2; grid-column: 2; }
.sv-contract-araguaia .signature-slot-witness-1 { grid-row: 3; grid-column: 1; }
.sv-contract-araguaia .signature-slot-witness-2 { grid-row: 3; grid-column: 2; }
/* Blocos pontuais ARAGUAIA — não partir entre páginas (1.3, item 8, CG-4, alínea C) */
.sv-contract-araguaia .araguaia-keep-together,
.sv-contract-araguaia .araguaia-financial-item-1-3 {
  page-break-inside: avoid !important;
  break-inside: avoid-page !important;
  -webkit-column-break-inside: avoid;
}
/* Ajuste mínimo: evita corte do CPF nas testemunhas sem aumentar o pack. */
.sv-contract-araguaia .signature-slot-intervenient,
.sv-contract-araguaia .signature-slot-witness-1,
.sv-contract-araguaia .signature-slot-witness-2 {
  padding-top: 2px;
  padding-bottom: 10px;
  overflow: visible;
  box-sizing: border-box;
}
.sv-contract-araguaia .signature-slot-witness-1 .signature-line,
.sv-contract-araguaia .signature-slot-witness-2 .signature-line {
  margin-top: 18px;
}
.sv-contract-araguaia .signature-slot-witness-1 > p,
.sv-contract-araguaia .signature-slot-witness-2 > p {
  line-height: 1.35;
  margin-bottom: 1px;
}
</style>`;
}

export const ARAGUAIA_HTML2PDF_PAGINATION_AVOID = [
  '.araguaia-clause-keep',
  '.araguaia-keep-together',
  '.araguaia-financial-item-1-3',
  '.araguaia-financial-item-8',
  '.araguaia-general-conditions-item-3',
  '.araguaia-general-conditions-item-4',
  '.araguaia-sixth-letter-b',
  '.araguaia-sixth-letter-c',
  '.araguaia-ninth-letter-c',
  '.contract-closing-and-signatures--araguaia',
  '.sv-contract-araguaia .signature-slot',
  '.sv-cert-official-block',
  '.sv-cert-official-inner',
  '.sv-cert-official',
];

export function generateAraguaiaContract(
  params: GenerateAraguaiaContractParams,
): string {
  const ctx = buildAraguaiaContractContext(params);

  return `
    ${buildAraguaiaContractPaginationCss()}
    <div class="sv-contract-document sv-contract-araguaia" data-contract-model="ARAGUAIA" style="font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.5; color: #111; background: #fff; padding: 0; margin: 0; width: 100%; max-width: ${CONTRACT_PDF_CONTENT_WIDTH_PX}px; box-sizing: border-box; text-align: justify;">
      ${buildAraguaiaTitleHtml()}
      ${buildAraguaiaBodyHtml(ctx)}
      ${buildAraguaiaSignaturesHtml(ctx)}
    </div>
  `;
}
