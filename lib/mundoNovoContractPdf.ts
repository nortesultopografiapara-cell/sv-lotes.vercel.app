/**
 * Chrome PDF do MUNDO_NOVO — isolado do ARAGUAIA.
 *
 * A logo do cabeçalho NÃO vem do gerador HTML nem de companies.logo_url
 * (marca da empresa RR = Chacreamento Araguaia). O MUNDO_NOVO usa somente
 * o asset estático em public/.
 */

import { displayContractNumber } from '@/lib/contractNumber';

/** Caminho público (browser) do PNG — chrome físico html2pdf. */
export const MUNDO_NOVO_LOGO_PATH = '/logo-chacreamento-mundo-novo.png';

/** Nome do ficheiro em public/ (chrome físico). */
export const MUNDO_NOVO_LOGO_PUBLIC_FILE = 'logo-chacreamento-mundo-novo.png';

/**
 * Asset exclusivo do cabeçalho ELECTRONIC_SIGNED.
 * Não reutiliza o filename anterior (cache / tenant.logo_url da R R).
 */
export const MUNDO_NOVO_ELECTRONIC_LOGO_PATH =
  '/logo-chacreamento-mundo-novo-oficial.png';
export const MUNDO_NOVO_ELECTRONIC_LOGO_PUBLIC_FILE =
  'logo-chacreamento-mundo-novo-oficial.png';

/** Dimensões nativas do PNG oficial (não deformar). */
export const MUNDO_NOVO_LOGO_NATIVE_WIDTH = 1024;
export const MUNDO_NOVO_LOGO_NATIVE_HEIGHT = 682;

const MUNDO_NOVO_LOGO_MAX_WIDTH_MM = 24;
const MUNDO_NOVO_LOGO_MAX_HEIGHT_MM = 16;

export function mundoNovoPdfChromeLogoSizeMm(): {
  widthMm: number;
  heightMm: number;
} {
  const ratio = MUNDO_NOVO_LOGO_NATIVE_WIDTH / MUNDO_NOVO_LOGO_NATIVE_HEIGHT;
  let widthMm = MUNDO_NOVO_LOGO_MAX_WIDTH_MM;
  let heightMm = widthMm / ratio;
  if (heightMm > MUNDO_NOVO_LOGO_MAX_HEIGHT_MM) {
    heightMm = MUNDO_NOVO_LOGO_MAX_HEIGHT_MM;
    widthMm = heightMm * ratio;
  }
  return {
    widthMm: Math.round(widthMm * 10) / 10,
    heightMm: Math.round(heightMm * 10) / 10,
  };
}

function mmToHeaderPx(mm: number): number {
  return Math.round((mm / 25.4) * 96);
}

function escapeMundoNovoHeaderHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Cabeçalho Chromium 3 colunas — só ELECTRONIC_SIGNED MUNDO_NOVO.
 * Não altera o chrome físico (jsPDF) nem o ARAGUAIA.
 */
export function buildMundoNovoElectronicSaleContractPrintTemplates(chrome: {
  tenantName: string;
  tenantCnpj: string;
  tenantDocumentLabel?: string;
  addressLine: string;
  cityUfLine: string;
  contractNumber: string;
  logoBase64: string | null;
  logoWidthMm?: number;
  logoHeightMm?: number;
}): {
  headerTemplate: string;
  footerTemplate: string;
} {
  const contractLabel = `Contrato nº ${displayContractNumber(chrome.contractNumber)}`;
  const size = mundoNovoPdfChromeLogoSizeMm();
  const logoW = mmToHeaderPx(size.widthMm);
  const logoH = mmToHeaderPx(size.heightMm);
  const logoImg = chrome.logoBase64
    ? `<div style="width:${logoW}px;height:${logoH}px;max-width:100%;">
            <img src="${chrome.logoBase64}" alt="Chacreamento Mundo Novo" width="${logoW}" height="${logoH}" style="width:100%;height:100%;object-fit:contain;object-position:left center;display:block;" />
          </div>`
    : '';
  const docLabel = chrome.tenantDocumentLabel || 'CNPJ';
  const infoLine = [
    chrome.tenantCnpj ? `${docLabel}: ${escapeMundoNovoHeaderHtml(chrome.tenantCnpj)}` : '',
    chrome.cityUfLine ? escapeMundoNovoHeaderHtml(chrome.cityUfLine) : '',
  ]
    .filter(Boolean)
    .join(' | ');

  const headerTemplate = `
    <div style="font-size:8px;line-height:1.25;width:100%;padding:2px 14mm 2px 14mm;font-family:'Times New Roman',Times,serif;color:#222;box-sizing:border-box;">
      <table style="width:100%;border-collapse:collapse;border-bottom:0.8px solid #444;padding-bottom:2px;">
        <tr>
          <td style="width:17%;vertical-align:middle;padding:2px 8px 3px 0;">
            ${logoImg}
          </td>
          <td style="width:58%;vertical-align:middle;padding:2px 10px 3px 10px;text-align:left;">
            <div style="font-weight:bold;font-size:9.5px;line-height:1.2;color:#111;">${escapeMundoNovoHeaderHtml(String(chrome.tenantName || '').toUpperCase())}</div>
            ${infoLine ? `<div style="font-size:7.5px;line-height:1.25;margin-top:1px;">${infoLine}</div>` : ''}
            ${chrome.addressLine ? `<div style="font-size:7.5px;line-height:1.25;">${escapeMundoNovoHeaderHtml(chrome.addressLine)}</div>` : ''}
          </td>
          <td style="width:25%;vertical-align:middle;padding:2px 0 3px 8px;text-align:right;white-space:nowrap;font-size:8.5px;">
            ${escapeMundoNovoHeaderHtml(contractLabel)}
          </td>
        </tr>
      </table>
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

/** Sempre o asset oficial — nunca companies.logo_url nem URL de projeto. */
export function resolveMundoNovoPdfChromeLogo(_input?: {
  projectLogoUrl?: unknown;
}): string {
  return MUNDO_NOVO_LOGO_PATH;
}
