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

/** Logo no chrome jsPDF — mesma caixa do cabeçalho homologado (ao lado do texto). */
export const ESTRELA_DO_SUL_PDF_LOGO_MM = {
  width: 26,
  height: 18,
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
  '.estrela-closing-statement',
  '.estrela-clause-keep',
  '.sv-contract-estrela-do-sul .signature-slot',
  '.sv-contract-estrela-do-sul .estrela-sign-slot',
  '.sv-cert-official-block',
  '.sv-cert-official-inner',
  '.sv-cert-official',
] as const;

export const ESTRELA_CAPA_OVERFLOW_MESSAGE =
  'Capa Resumo ESTRELA_DO_SUL excedeu a capacidade física de 2 páginas. O PDF não deve criar uma página intermediária quase vazia; revise confrontações ou nomes excepcionalmente longos.';

export type EstrelaCapaOverflowReport = {
  overflow: boolean;
  page1H: number;
  page2H: number;
  pageH: number;
};

/**
 * Mede as duas páginas da Capa Resumo. Relata overflow em vez de empurrar
 * notas/assinaturas para uma página quase vazia.
 */
export function reportEstrelaCapaTwoPageOverflow(
  element: ParentNode,
): EstrelaCapaOverflowReport {
  const page1 = element.querySelector('.estrela-capa-page-1') as HTMLElement | null;
  const page2 = element.querySelector('.estrela-capa-page-2') as HTMLElement | null;
  const pageH = ESTRELA_DO_SUL_PAGE_CONTENT_HEIGHT_PX;
  if (!page1 || !page2) {
    return { overflow: false, page1H: 0, page2H: 0, pageH };
  }
  const page1H = Math.ceil(page1.getBoundingClientRect().height || 0);
  const page2H = Math.ceil(page2.getBoundingClientRect().height || 0);
  const overflow = page1H > pageH + 12 || page2H > pageH + 12;
  page1.setAttribute('data-estrela-capa-overflow', overflow ? 'true' : 'false');
  page2.setAttribute('data-estrela-capa-overflow', overflow ? 'true' : 'false');
  if (overflow && typeof console !== 'undefined' && console.warn) {
    console.warn('[ESTRELA_CAPA]', ESTRELA_CAPA_OVERFLOW_MESSAGE, {
      page1H,
      page2H,
      pageH,
    });
  }
  return { overflow, page1H, page2H, pageH };
}
