/**
 * Impressão / PDF do editor CUSTOM — mesma paginação visual A4.
 * Não usa generateContractHTML nem motores TypeScript.
 */

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
      html, body { margin: 0; background: #fff; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    </style>
  </head><body><div class="sv-a4-sheet sv-a4-prose sv-editor-preview-doc">${html}</div></body></html>`);
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
