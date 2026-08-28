/**
 * PDF ELECTRONIC_SIGNED MUNDO_NOVO — contrato e certificado em páginas distintas.
 * O Chromium ignora page-break no certificado quando overflow+avoid encostam
 * o bloco no resto da última página do contrato. Merge garante a página 8.
 * Não altera ARAGUAIA nem PHYSICAL_UNSIGNED.
 */

import { PDFDocument } from 'pdf-lib';
import {
  buildSaleContractPdfFromHtml,
  buildSaleContractPrintTemplates,
  launchSaleContractPdfBrowser,
} from '@/lib/saleContractPdf';
import type { ContractPdfChromeInput } from '@/lib/contractPdfPostProcess';
import {
  CONTRACT_PDF_CONTENT_WIDTH_PX,
  CONTRACT_PDF_MARGIN_MM,
} from '@/lib/contractPaginationEngine';
import { isPdfBytes } from '@/lib/saasContractPdfHttp';

const CERT_START = /<div class="sv-cert-official-block/;
const SPACER_START = '<div class="sv-mundo-novo-cert-page-break"';

export function splitMundoNovoContractAndCertificateHtml(html: string): {
  contractHtml: string;
  certificateHtml: string;
} {
  const raw = String(html || '');
  const certMatch = raw.search(CERT_START);
  if (certMatch < 0) {
    return { contractHtml: raw, certificateHtml: '' };
  }
  const spacerIdx = raw.indexOf(SPACER_START);
  const contractEnd =
    spacerIdx >= 0 && spacerIdx < certMatch ? spacerIdx : certMatch;
  let certificateHtml = raw.slice(certMatch);
  certificateHtml = certificateHtml
    .replace(/<style id="mundo-novo-cert-new-page-css">[\s\S]*?<\/style>/g, '')
    .replace(/\s*sv-mundo-novo-cert-new-page/g, '')
    .replace(/page-break-before:\s*always;?/gi, '')
    .replace(/break-before:\s*page;?/gi, '');
  return {
    contractHtml: raw.slice(0, contractEnd),
    certificateHtml,
  };
}

async function buildCertificateOnlyPdf(
  certificateHtml: string,
  chrome: ContractPdfChromeInput,
): Promise<Uint8Array> {
  const { headerTemplate, footerTemplate } =
    buildSaleContractPrintTemplates(chrome);
  const documentHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Certificado</title>
<style>
  html, body { margin: 0; padding: 0; zoom: 0.62; }
</style>
</head>
<body>${certificateHtml}<style id="mundo-novo-cert-standalone-css">
body .sv-cert-official-block,
body .sv-cert-official-block * {
  page-break-before: auto !important;
  break-before: auto !important;
  page-break-after: auto !important;
  break-after: auto !important;
  page-break-inside: auto !important;
  break-inside: auto !important;
}
body .sv-cert-official-block {
  overflow: visible !important;
  margin-top: 0 !important;
}
</style></body></html>`;

  const browser = await launchSaleContractPdfBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({
      width: CONTRACT_PDF_CONTENT_WIDTH_PX,
      height: 1123,
      deviceScaleFactor: 1,
    });
    await page.setContent(documentHtml, { waitUntil: 'load', timeout: 45_000 });
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
      throw new Error('Chromium retornou certificado PDF inválido.');
    }
    return bytes;
  } finally {
    await page.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

export async function mergePdfByteArrays(
  parts: Uint8Array[],
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const part of parts) {
    if (!part || part.byteLength < 8) continue;
    const doc = await PDFDocument.load(part);
    const pages = await out.copyPages(doc, doc.getPageIndices());
    for (const page of pages) out.addPage(page);
  }
  return out.save();
}

export async function buildMundoNovoElectronicSignedPdfFromHtml(
  html: string,
  chrome: ContractPdfChromeInput,
): Promise<Uint8Array> {
  const { contractHtml, certificateHtml } =
    splitMundoNovoContractAndCertificateHtml(html);
  const contractPdf = await buildSaleContractPdfFromHtml(contractHtml, chrome);
  if (!certificateHtml.trim()) return contractPdf;
  const certificatePdf = await buildCertificateOnlyPdf(certificateHtml, chrome);
  const merged = await mergePdfByteArrays([contractPdf, certificatePdf]);
  return merged;
}
