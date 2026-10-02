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

export function printCustomContractPreview(root: HTMLElement, title = 'Contrato'): void {
  const html = root.innerHTML;
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
    <style>
      @page { size: A4; margin: 0; }
      html, body {
        margin: 0;
        background: #fff;
        --paper-width: ${CUSTOM_A4_WIDTH_MM}mm;
        --paper-height: ${CUSTOM_A4_PAGE_MM}mm;
        --paper-pad: ${CUSTOM_A4_MARGIN_MM}mm;
      }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    </style>
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
