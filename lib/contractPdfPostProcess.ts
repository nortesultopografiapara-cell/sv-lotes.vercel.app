/**
 * Pós-processamento de PDF gerado via html2pdf (contrato).
 */

/** Remove páginas finais praticamente vazias (só cabeçalho/rodapé). */
export function removeTrailingBlankPdfPages(pdf: {
  internal: { getNumberOfPages: () => number; pages?: unknown[] };
  deletePage: (n: number) => void;
  setPage: (n: number) => void;
}): void {
  let total = pdf.internal.getNumberOfPages();
  const pages = pdf.internal.pages as unknown[] | undefined;

  while (total > 1 && pages) {
    const pageOps = pages[total];
    const opCount = Array.isArray(pageOps) ? pageOps.length : 0;
    if (opCount > 25) break;
    pdf.deletePage(total);
    total = pdf.internal.getNumberOfPages();
  }
}
