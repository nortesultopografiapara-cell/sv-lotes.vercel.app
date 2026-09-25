/**
 * Margens html2pdf só do Estrela. O chrome global cabe em ~26mm no topo e ~12mm
 * no rodapé; 48/28mm do motor clássico sobrava faixa vazia em cada página.
 */
export const ESTRELA_DO_SUL_PDF_MARGIN_MM = {
  top: 36,
  right: 15,
  bottom: 24,
  left: 15,
} as const;

/** Área útil A4 com as margens do Estrela (físico html2pdf e Chromium assinado). */
export const ESTRELA_DO_SUL_PAGE_CONTENT_HEIGHT_PX = Math.round(
  ((297 -
    ESTRELA_DO_SUL_PDF_MARGIN_MM.top -
    ESTRELA_DO_SUL_PDF_MARGIN_MM.bottom) /
    25.4) *
    96,
);

/** Logo no chrome jsPDF — ocupa a faixa do cabeçalho sem invadir o texto. */
export const ESTRELA_DO_SUL_PDF_LOGO_MM = {
  width: 28,
  height: 16,
} as const;

/** Seletores html2pdf isolados — ESTRELA_DO_SUL. */
export const ESTRELA_DO_SUL_HTML2PDF_PAGINATION_AVOID = [
  '.estrela-item:not(.estrela-item--long)',
  '.estrela-item-group',
  '.estrela-clause-head',
  '.estrela-td-keep',
  '.estrela-footnote',
  '.estrela-capa-annex-table',
  '.estrela-capa-signatures',
  '.estrela-clause-keep',
  '.contract-closing-and-signatures--estrela',
  '.sv-contract-estrela-do-sul .signature-slot',
  '.sv-contract-estrela-do-sul .estrela-sign-slot',
  '.sv-contract-estrela-do-sul .signature-grid--estrela',
  '.sv-cert-official-block',
  '.sv-cert-official-inner',
  '.sv-cert-official',
] as const;
