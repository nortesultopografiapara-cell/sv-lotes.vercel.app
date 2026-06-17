/**
 * Geração server-side de PDF de contrato de venda (Chromium + page.pdf).
 * Pipeline HTML: buildContractViewHtml / loadSaleContractHtmlForSign + CONTRACT_PDF_PRINT_CSS.
 */

import puppeteer, { type Browser } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { loadSvLotesLogoDataUrl } from '@/lib/brandLogoServer';
import { displayContractNumber } from '@/lib/contractNumber';
import {
  CONTRACT_PDF_PRINT_CSS,
  type ContractPdfChromeInput,
} from '@/lib/contractPdfPostProcess';
import { isPdfBytes } from '@/lib/saasContractPdfHttp';

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function wrapSaleContractHtmlDocument(
  htmlFragment: string,
  title = 'Contrato',
): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
${CONTRACT_PDF_PRINT_CSS}
<style>
  body { margin: 0; padding: 0; font-family: 'Times New Roman', Times, serif; font-size: 12pt; color: #111; }
</style>
</head>
<body>${htmlFragment}</body>
</html>`;
}

export function buildSaleContractPrintTemplates(chrome: ContractPdfChromeInput): {
  headerTemplate: string;
  footerTemplate: string;
} {
  const contractLabel = `Contrato nº ${displayContractNumber(chrome.contractNumber)}`;
  const infoParts: string[] = [];
  if (chrome.tenantCnpj) infoParts.push(`CNPJ: ${escapeHtml(chrome.tenantCnpj)}`);
  if (chrome.cityUfLine) infoParts.push(escapeHtml(chrome.cityUfLine));
  const infoLine = infoParts.join(' | ');

  const logoImg = chrome.logoBase64
    ? `<img src="${chrome.logoBase64}" style="height:12px; margin-right:6px; vertical-align:middle;" />`
    : '';

  const headerTemplate = `
    <div style="font-size:8px; width:100%; padding:0 14mm 4px 14mm; font-family:'Times New Roman', Times, serif; color:#333; box-sizing:border-box;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1px solid #999; padding-bottom:4px;">
        <div style="max-width:72%;">
          ${logoImg}<strong>${escapeHtml(String(chrome.tenantName || '').toUpperCase())}</strong>
          ${infoLine ? `<br/><span>${infoLine}</span>` : ''}
          ${chrome.addressLine ? `<br/><span>${escapeHtml(chrome.addressLine)}</span>` : ''}
        </div>
        <div style="text-align:right; white-space:nowrap;">${escapeHtml(contractLabel)}</div>
      </div>
    </div>`;

  const footerTemplate = `
    <div style="font-size:7px; width:100%; padding:4px 14mm 0; font-family:'Times New Roman', Times, serif; color:#666; font-style:italic; box-sizing:border-box;">
      <div style="border-top:1px solid #ccc; padding-top:4px; display:flex; justify-content:space-between;">
        <span>Documento emitido digitalmente pelo SV LOTES GIS</span>
        <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
      </div>
    </div>`;

  return { headerTemplate, footerTemplate };
}

export function isSaleSignPdfServerless(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION);
}

export async function launchSaleContractPdfBrowser(): Promise<Browser> {
  if (isSaleSignPdfServerless()) {
    chromium.setGraphicsMode = false;
    const executablePath = await chromium.executablePath();
    console.log('[sale-sign-pdf] launch serverless chromium', {
      node: process.version,
      executablePath,
    });
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
    });
  }

  try {
    return puppeteer.launch({
      channel: 'chrome',
      headless: true,
    });
  } catch (localChromeErr) {
    console.warn('[sale-sign-pdf] chrome local indisponível, tentando @sparticuz/chromium', {
      message: localChromeErr instanceof Error ? localChromeErr.message : String(localChromeErr),
    });
    chromium.setGraphicsMode = false;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  }
}

export async function loadTenantLogoBase64ForPdf(
  tenant: Record<string, unknown> | null | undefined,
): Promise<string | null> {
  const logoUrl = String(tenant?.logo_url || '').trim();
  if (logoUrl) {
    try {
      const res = await fetch(logoUrl, { cache: 'no-store' });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const mime = res.headers.get('content-type') || 'image/png';
        return `data:${mime};base64,${buf.toString('base64')}`;
      }
    } catch {
      /* fallback logo SV LOTES */
    }
  }
  return loadSvLotesLogoDataUrl();
}

export async function buildSaleContractPdfFromHtml(
  htmlFragment: string,
  chrome: ContractPdfChromeInput,
): Promise<Uint8Array> {
  const documentHtml = wrapSaleContractHtmlDocument(
    htmlFragment,
    `Contrato ${chrome.contractNumber}`,
  );
  const { headerTemplate, footerTemplate } = buildSaleContractPrintTemplates(chrome);

  let browser: Browser | null = null;
  let page: Awaited<ReturnType<Browser['newPage']>> | null = null;

  try {
    browser = await launchSaleContractPdfBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    await page.setContent(documentHtml, { waitUntil: 'load', timeout: 45_000 });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '35mm', right: '15mm', bottom: '25mm', left: '15mm' },
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
    });

    const bytes = new Uint8Array(pdfBuffer);
    if (!isPdfBytes(bytes)) {
      throw new Error('Chromium retornou buffer inválido (cabeçalho %PDF ausente).');
    }
    return bytes;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error('[sale-sign-pdf] buildSaleContractPdfFromHtml failed', {
      message,
      stack,
      contractNumber: chrome.contractNumber,
      htmlLength: htmlFragment.length,
      serverless: isSaleSignPdfServerless(),
    });
    throw err instanceof Error ? err : new Error(message);
  } finally {
    await page?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
