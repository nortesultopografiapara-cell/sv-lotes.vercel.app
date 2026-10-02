/**
 * Impressão / PDF do editor CUSTOM — mesma paginação visual A4.
 * Não usa generateContractHTML nem motores TypeScript.
 *
 * Área útil: A4 210mm com padding --paper-pad (15mm). @page margin 0
 * para não duplicar a margem do conteúdo já diagramado.
 */
import {
  CUSTOM_A4_MARGIN_MM,
  CUSTOM_A4_PAGE_MM,
  CUSTOM_A4_WIDTH_MM,
} from '@/lib/customContractA4Layout';

/** CSS injetado no iframe de impressão — autoridade única de quebra = spacers. */
export const CUSTOM_CONTRACT_PRINT_EXTRA_CSS = `
@page { size: A4; margin: 0; }
html, body {
  margin: 0;
  background: #fff;
  --paper-width: ${CUSTOM_A4_WIDTH_MM}mm;
  --paper-height: ${CUSTOM_A4_PAGE_MM}mm;
  --paper-pad: ${CUSTOM_A4_MARGIN_MM}mm;
}
body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.sv-page-break {
  display: none !important;
  height: 0 !important;
  page-break-after: auto !important;
  break-after: auto !important;
}
.sv-a4-flow-gap,
.sv-a4-flow-gap-row {
  height: 0 !important;
  page-break-after: always !important;
  break-after: page !important;
}
.sv-lf-estrela .sv-lf-note,
.sv-lf-estrela .sv-lf-footnote,
.sv-lf-estrela .lf-estrela-footnote,
.sv-editor-preview-doc .sv-lf-estrela .sv-lf-note,
.sv-editor-preview-doc .sv-lf-estrela .sv-lf-footnote,
.sv-editor-preview-doc .sv-lf-estrela .lf-estrela-footnote {
  font-size: 7pt !important;
  line-height: 1.1 !important;
}
.sv-lf-estrela .sv-lf-sign,
.sv-lf-estrela .lf-estrela-signatures,
.sv-lf-estrela .sv-lf-sign td,
.sv-lf-estrela .sv-lf-sign-col,
.sv-lf-estrela .sv-lf-sign-slot,
.sv-lf-estrela .sv-lf-sign * {
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
}
`.trim();

export function printCustomContractPreview(root: HTMLElement, title = 'Contrato'): void {
  const sheet = root.classList.contains('sv-a4-sheet')
    ? root
    : (root.querySelector('.sv-a4-sheet') as HTMLElement | null);
  const html = (sheet || root).innerHTML;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return;
  }
  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((node) => node.outerHTML)
    .join('\n');
  doc.open();
  doc.write(`<!doctype html><html><head><title>${title}</title>${styles}
    <style>${CUSTOM_CONTRACT_PRINT_EXTRA_CSS}</style>
  </head><body class="sv-editor-preview-doc">${html}</body></html>`);
  doc.close();
  const run = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } finally {
      setTimeout(() => frame.remove(), 1500);
    }
  };
  setTimeout(run, 250);
}
