/**
 * Geração server-side de PDF de contrato de venda (Chromium + page.pdf).
 * Pipeline HTML: buildContractViewHtml / loadSaleContractHtmlForSign + CONTRACT_PDF_PRINT_CSS.
 */

import fs from 'node:fs';
import path from 'node:path';
import puppeteer, { type Browser } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { loadSvLotesLogoDataUrl } from '@/lib/brandLogoServer';
import {
  MUNDO_NOVO_LOGO_PUBLIC_FILE,
  buildMundoNovoElectronicSaleContractPrintTemplates,
} from '@/lib/mundoNovoContractPdf';
import { displayContractNumber } from '@/lib/contractNumber';
import {
  CONTRACT_PDF_PRINT_CSS,
  type ContractPdfChromeInput,
} from '@/lib/contractPdfPostProcess';
import {
  CONTRACT_PAGINATION_MEASURE_SCRIPT,
  CONTRACT_PDF_CONTENT_WIDTH_PX,
  CONTRACT_PDF_MARGIN_MM,
} from '@/lib/contractPaginationEngine';
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
  html, body {
    margin: 0;
    padding: 0;
    width: ${CONTRACT_PDF_CONTENT_WIDTH_PX}px;
    max-width: ${CONTRACT_PDF_CONTENT_WIDTH_PX}px;
    box-sizing: border-box;
    font-family: 'Times New Roman', Times, serif;
    font-size: 12pt;
    color: #111;
  }
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
  const docLabel = chrome.tenantDocumentLabel || 'CNPJ';
  if (chrome.tenantCnpj) infoParts.push(`${docLabel}: ${escapeHtml(chrome.tenantCnpj)}`);
  if (chrome.cityUfLine) infoParts.push(escapeHtml(chrome.cityUfLine));
  const infoLine = infoParts.join(' | ');

  const logoImg = chrome.logoBase64
    ? `<img src="${chrome.logoBase64}" style="height:11px; margin-right:5px; vertical-align:middle;" />`
    : '';

  // Altura do template deve caber em CONTRACT_PDF_MARGIN_MM.top / .bottom (Chromium).
  const headerTemplate = `
    <div style="font-size:7px; line-height:1.2; width:100%; padding:1px 14mm 1px 14mm; font-family:'Times New Roman', Times, serif; color:#333; box-sizing:border-box;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:0.8px solid #999; padding-bottom:2px;">
        <div style="max-width:72%;">
          ${logoImg}<strong style="font-size:7.5px;">${escapeHtml(String(chrome.tenantName || '').toUpperCase())}</strong>
          ${infoLine ? `<br/><span>${infoLine}</span>` : ''}
          ${chrome.addressLine ? `<br/><span>${escapeHtml(chrome.addressLine)}</span>` : ''}
        </div>
        <div style="text-align:right; white-space:nowrap; font-size:7px;">${escapeHtml(contractLabel)}</div>
      </div>
    </div>`;

  const footerTemplate = `
    <div style="font-size:6.5px; line-height:1.15; width:100%; padding:1px 14mm 0; font-family:'Times New Roman', Times, serif; color:#666; font-style:italic; box-sizing:border-box;">
      <div style="border-top:0.8px solid #ccc; padding-top:2px; display:flex; justify-content:space-between;">
        <span>Documento emitido digitalmente pelo SV LOTES GIS</span>
        <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
      </div>
    </div>`;

  return { headerTemplate, footerTemplate };
}

export function buildSvLotes2SaleContractPrintTemplates(chrome: ContractPdfChromeInput): {
  headerTemplate: string;
  footerTemplate: string;
} {
  const logoImg = chrome.logoBase64
    ? `<img src="${chrome.logoBase64}" style="height:14px;margin-right:6px;vertical-align:middle;" />`
    : '';

  const docLabel = chrome.tenantDocumentLabel || 'CNPJ';
  const metaLines: string[] = [];
  if (chrome.tenantCnpj) {
    metaLines.push(`${escapeHtml(docLabel)}: ${escapeHtml(chrome.tenantCnpj)}`);
  }
  if (chrome.addressLine) {
    metaLines.push(escapeHtml(chrome.addressLine));
  } else if (chrome.cityUfLine) {
    metaLines.push(escapeHtml(chrome.cityUfLine));
  }
  if (chrome.tenantCep && !String(chrome.addressLine || '').includes(chrome.tenantCep)) {
    metaLines.push(`CEP ${escapeHtml(chrome.tenantCep)}`);
  }
  const contactParts = [chrome.tenantPhone, chrome.tenantEmail]
    .filter(Boolean)
    .map((part) => escapeHtml(String(part)));
  if (contactParts.length) {
    metaLines.push(contactParts.join(' · '));
  }

  const metaHtml = metaLines
    .map((line) => `<span style="display:block;line-height:1.35;">${line}</span>`)
    .join('');

  const headerTemplate = `
    <div style="font-size:7px;width:100%;padding:0 14mm 4px 14mm;font-family:'Segoe UI',Arial,sans-serif;color:#334155;box-sizing:border-box;">
      <div style="display:flex;align-items:flex-start;gap:8px;border-bottom:1px solid #cbd5e1;padding-bottom:3px;">
        <div style="flex-shrink:0;padding-top:1px;">${logoImg}</div>
        <div style="min-width:0;">
          <strong style="display:block;font-size:7.5px;color:#1e3a8a;line-height:1.3;">${escapeHtml(String(chrome.tenantName || '').toUpperCase())}</strong>
          ${metaHtml}
        </div>
      </div>
    </div>`;

  const footerTemplate = `
    <div style="font-size:7px;width:100%;padding:4px 14mm 0;font-family:'Segoe UI',Arial,sans-serif;color:#64748b;box-sizing:border-box;">
      <div style="border-top:1px solid #cbd5e1;padding-top:4px;display:flex;justify-content:space-between;">
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

function loadMundoNovoLogoDataUrl(): string | null {
  try {
    const filePath = path.join(process.cwd(), 'public', MUNDO_NOVO_LOGO_PUBLIC_FILE);
    if (!fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function loadTenantLogoBase64ForPdf(
  tenant: Record<string, unknown> | null | undefined,
): Promise<string | null> {
  const { isMundoNovoContractModel } = await import('@/lib/contractModel');
  if (isMundoNovoContractModel(tenant)) {
    return loadMundoNovoLogoDataUrl();
  }

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
  const { headerTemplate, footerTemplate } =
    chrome.headerVariant === 'mundo-novo-electronic'
      ? buildMundoNovoElectronicSaleContractPrintTemplates(chrome)
      : chrome.printStyle === 'sv-lotes-2'
        ? buildSvLotes2SaleContractPrintTemplates(chrome)
        : buildSaleContractPrintTemplates(chrome);

  let browser: Browser | null = null;
  let page: Awaited<ReturnType<Browser['newPage']>> | null = null;

  try {
    browser = await launchSaleContractPdfBrowser();
    page = await browser.newPage();
    await page.setViewport({
      width: CONTRACT_PDF_CONTENT_WIDTH_PX,
      height: 1123,
      deviceScaleFactor: 1,
    });
    await page.setContent(documentHtml, { waitUntil: 'load', timeout: 45_000 });

    // Engine única: mede espaço restante.
    // Assinaturas só vão para nova página se não couberem; certificado é independente
    // (nunca empurra assinaturas juntos — evita páginas quase vazias).
    try {
      await page.evaluate(CONTRACT_PAGINATION_MEASURE_SCRIPT);
    } catch (measureErr) {
      console.warn('[sale-sign-pdf] pagination measure skipped', {
        message: measureErr instanceof Error ? measureErr.message : String(measureErr),
      });
    }

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
