/**
 * Geração server-side de PDF de contrato de venda — mesmo pipeline do módulo Contratos
 * (buildContractViewHtml → html2pdf.js → applyContractPdfChrome).
 */

import fs from 'fs';
import path from 'path';
import puppeteer, { type Browser } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { loadSvLotesLogoDataUrl } from '@/lib/brandLogoServer';
import {
  CONTRACT_PDF_PRINT_CSS,
  getContractHtml2pdfOptions,
  type ContractPdfChromeInput,
} from '@/lib/contractPdfPostProcess';
import { buildSaleContractPdfFilename } from '@/lib/saleContractPdfHttp';

const HTML2PDF_BUNDLE_PATH = path.join(
  process.cwd(),
  'node_modules/html2pdf.js/dist/html2pdf.bundle.min.js',
);
const CHROME_BROWSER_SCRIPT_PATH = path.join(
  process.cwd(),
  'lib/contractPdfChromeBrowser.js',
);

async function launchBrowser(): Promise<Browser> {
  const isServerless = Boolean(
    process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION,
  );

  if (isServerless) {
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  }

  try {
    return puppeteer.launch({
      channel: 'chrome',
      headless: true,
    });
  } catch {
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
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
  if (!fs.existsSync(HTML2PDF_BUNDLE_PATH)) {
    throw new Error('html2pdf.js não encontrado — execute npm install.');
  }
  if (!fs.existsSync(CHROME_BROWSER_SCRIPT_PATH)) {
    throw new Error('contractPdfChromeBrowser.js não encontrado.');
  }

  const html2pdfBundle = fs.readFileSync(HTML2PDF_BUNDLE_PATH, 'utf8');
  const chromeScript = fs.readFileSync(CHROME_BROWSER_SCRIPT_PATH, 'utf8');
  const filename = buildSaleContractPdfFilename(chrome.contractNumber);
  const options = getContractHtml2pdfOptions(filename);

  const documentHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
${CONTRACT_PDF_PRINT_CSS}
<style>body { margin: 0; padding: 0; font-family: 'Times New Roman', Times, serif; }</style>
</head>
<body></body>
</html>`;

  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    await page.setContent(documentHtml, { waitUntil: 'networkidle0', timeout: 60_000 });
    await page.addScriptTag({ content: html2pdfBundle });
    await page.addScriptTag({ content: chromeScript });

    const pdfBytes = await page.evaluate(
      async (bodyHtml, pdfOptions, chromeData) => {
        const element = document.createElement('div');
        element.innerHTML = bodyHtml;
        document.body.appendChild(element);

        // @ts-expect-error html2pdf global injetado
        const pdf = await html2pdf()
          .from(element)
          .set(pdfOptions)
          .toPdf()
          .get('pdf');

        // @ts-expect-error applyContractPdfChromeBrowser global injetado
        applyContractPdfChromeBrowser(pdf, chromeData);

        const buf = pdf.output('arraybuffer') as ArrayBuffer;
        return Array.from(new Uint8Array(buf));
      },
      htmlFragment,
      options,
      chrome,
    );

    return new Uint8Array(pdfBytes);
  } finally {
    await page.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}
