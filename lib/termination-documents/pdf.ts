/**
 * PDF exclusivamente a partir do HTML congelado no snapshot.
 * Reutiliza o Chromium já homologado dos contratos de venda.
 */

import { launchSaleContractPdfBrowser } from '@/lib/saleContractPdf';
import {
  CONTRACT_PDF_CONTENT_WIDTH_PX,
  CONTRACT_PDF_MARGIN_MM,
} from '@/lib/contractPaginationEngine';
import { isPdfBytes } from '@/lib/saasContractPdfHttp';
import { assertFrozenHtmlUnchanged } from '@/lib/termination-documents/hash';
import type { TerminationDocumentSnapshot } from '@/lib/termination-documents/types';

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function renderTerminationDocumentPdfFromFrozenHtml(
  snapshot: TerminationDocumentSnapshot,
): Promise<Uint8Array> {
  assertFrozenHtmlUnchanged(snapshot.html, snapshot.contentHash);

  const headerTemplate = `
    <div style="font-size:7px; line-height:1.2; width:100%; padding:1px 14mm 1px 14mm; font-family:'Times New Roman', Times, serif; color:#333; box-sizing:border-box;">
      <div style="display:flex; justify-content:space-between; border-bottom:0.8px solid #999; padding-bottom:2px;">
        <span><strong>${escapeHtml(snapshot.vendor.name || 'SV LOTES')}</strong></span>
        <span>Termo nº ${escapeHtml(snapshot.documentNumber)}</span>
      </div>
    </div>`;
  const footerTemplate = `
    <div style="font-size:6.5px; line-height:1.15; width:100%; padding:1px 14mm 0; font-family:'Times New Roman', Times, serif; color:#666; font-style:italic; box-sizing:border-box;">
      <div style="border-top:0.8px solid #ccc; padding-top:2px; display:flex; justify-content:space-between;">
        <span>Documento histórico — conteúdo congelado no ato da operação</span>
        <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
      </div>
    </div>`;

  let browser: Awaited<ReturnType<typeof launchSaleContractPdfBrowser>> | null = null;
  let page: Awaited<ReturnType<NonNullable<typeof browser>['newPage']>> | null = null;
  try {
    browser = await launchSaleContractPdfBrowser();
    page = await browser.newPage();
    await page.setViewport({
      width: CONTRACT_PDF_CONTENT_WIDTH_PX,
      height: 1123,
      deviceScaleFactor: 1,
    });
    await page.setContent(snapshot.html, { waitUntil: 'load', timeout: 45_000 });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: `${CONTRACT_PDF_MARGIN_MM.top}mm`,
        right: `${CONTRACT_PDF_MARGIN_MM.right}mm`,
        bottom: `${CONTRACT_PDF_MARGIN_MM.bottom}mm`,
        left: `${CONTRACT_PDF_MARGIN_MM.left}mm`,
      },
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
    });
    const bytes = new Uint8Array(pdfBuffer);
    if (!isPdfBytes(bytes)) {
      throw new Error('PDF_INVALID_BUFFER');
    }
    return bytes;
  } finally {
    await page?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
