/**
 * Chrome PDF isolado — modelo ESTRELA_DO_SUL / LF Imóveis.
 */

import {
  cleanCompanyAddressLine,
  getCompanyDisplayName,
} from '@/lib/contractCompanyDisplay';
import { normalizeSellerFromCompany } from '@/lib/contractSeller';
import { toContractTitleCase } from '@/lib/contractTitleCase';
import { formatCpfCnpj } from '@/lib/inputMasks';
import { displayContractNumber } from '@/lib/contractNumber';
import type { ContractPdfChromeInput } from '@/lib/contractPdfPostProcess';
import { ESTRELA_DO_SUL_PDF_LOGO_MM } from '@/lib/estrelaDoSulHtml2PdfPagination';

/** Número predial explícito (N 99, Nº 10, , 100). Não usa o 24 de "Rua 24 de Março". */
export function lfCompanyAddressHasStreetNumber(address: string): boolean {
  const raw = String(address || '').trim();
  if (!raw) return false;
  const withoutSn = raw.replace(/,?\s*S\s*\/\s*N\b/gi, '').trim();
  if (!withoutSn) return false;
  if (/\bN[º°o.]?\s*\d+/i.test(withoutSn)) return true;
  if (/\bn[úu]mero\s*\d+/i.test(withoutSn)) return true;
  const withoutQuadraLote = withoutSn
    .replace(/\bquadra\s+\d+/gi, ' ')
    .replace(/\blote\s+\d+/gi, ' ');
  return /,\s*\d+\b/.test(withoutQuadraLote);
}

export function normalizeLfCompanyAddressLine(address: string): string {
  const s = cleanCompanyAddressLine(address);
  if (!s) return '';
  if (lfCompanyAddressHasStreetNumber(s)) {
    return s.replace(/,?\s*S\s*\/\s*N\s*$/i, '').replace(/,\s*$/g, '').trim();
  }
  if (/S\/N/i.test(s)) return s;
  return `${s}, S/N`;
}

function formatLfHeaderAddressTitle(address: string): string {
  return toContractTitleCase(address).replace(/\b(D[aeo]s?)\b/g, (token) =>
    token.toLowerCase(),
  );
}

export function formatLfCompanyAddressForHeader(
  company: Record<string, unknown> | null | undefined,
): { addressLine: string; cityUfLine: string } {
  const seller = normalizeSellerFromCompany(company);
  const addressLine =
    seller.address !== 'Não informado'
      ? formatLfHeaderAddressTitle(normalizeLfCompanyAddressLine(seller.address))
      : '';
  const city =
    seller.city !== 'Não informado' ? toContractTitleCase(seller.city) : '';
  const state =
    seller.state !== 'Não informado' ? seller.state.toUpperCase() : '';
  const cityUfLine = city && state ? `${city} - ${state}` : city || state || '';
  return { addressLine, cityUfLine };
}

function mmToHeaderPx(mm: number): number {
  return Math.round((mm / 25.4) * 96);
}

function escapeEstrelaHeaderHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Cabeçalho Chromium 3 colunas — PDF assinado LF/Estrela.
 * Logo = companies.logo_url (dinâmica). Não hardcodar marca LF.
 */
export function buildEstrelaDoSulSaleContractPrintTemplates(
  chrome: ContractPdfChromeInput,
): {
  headerTemplate: string;
  footerTemplate: string;
} {
  const contractLabel = `Contrato nº ${displayContractNumber(chrome.contractNumber)}`;
  const logoW = mmToHeaderPx(chrome.logoWidthMm ?? ESTRELA_DO_SUL_PDF_LOGO_MM.width);
  const logoH = mmToHeaderPx(chrome.logoHeightMm ?? ESTRELA_DO_SUL_PDF_LOGO_MM.height);
  const logoImg = chrome.logoBase64
    ? `<div style="width:${logoW}px;height:${logoH}px;max-width:100%;">
            <img src="${chrome.logoBase64}" alt="" width="${logoW}" height="${logoH}" style="width:100%;height:100%;object-fit:contain;object-position:left center;display:block;" />
          </div>`
    : '';
  const docLabel = chrome.tenantDocumentLabel || 'CNPJ';
  const infoLine = [
    chrome.tenantCnpj ? `${docLabel}: ${escapeEstrelaHeaderHtml(chrome.tenantCnpj)}` : '',
    chrome.cityUfLine ? escapeEstrelaHeaderHtml(chrome.cityUfLine) : '',
  ]
    .filter(Boolean)
    .join(' | ');

  const headerTemplate = `
    <div style="font-size:8px;line-height:1.25;width:100%;padding:2px 14mm 2px 14mm;font-family:'Times New Roman',Times,serif;color:#222;box-sizing:border-box;">
      <table style="width:100%;border-collapse:collapse;border-bottom:0.8px solid #444;">
        <tr>
          <td style="width:18%;vertical-align:middle;padding:2px 8px 3px 0;">
            ${logoImg}
          </td>
          <td style="width:57%;vertical-align:middle;padding:2px 10px 3px 10px;text-align:left;">
            <div style="font-weight:bold;font-size:9.5px;line-height:1.2;color:#111;">${escapeEstrelaHeaderHtml(String(chrome.tenantName || '').toUpperCase())}</div>
            ${infoLine ? `<div style="font-size:7.5px;line-height:1.25;margin-top:1px;">${infoLine}</div>` : ''}
            ${chrome.addressLine ? `<div style="font-size:7.5px;line-height:1.25;">${escapeEstrelaHeaderHtml(chrome.addressLine)}</div>` : ''}
          </td>
          <td style="width:25%;vertical-align:middle;padding:2px 0 3px 8px;text-align:right;white-space:nowrap;font-size:8.5px;">
            ${escapeEstrelaHeaderHtml(contractLabel)}
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

export function buildEstrelaDoSulPdfChrome(
  tenant: Record<string, unknown>,
  contractNumber: string,
  logoBase64: string | null = null,
): ContractPdfChromeInput {
  const { addressLine, cityUfLine } = formatLfCompanyAddressForHeader(tenant);
  return {
    tenantName: getCompanyDisplayName(tenant),
    tenantCnpj: formatCpfCnpj(String(tenant.cnpj || tenant.document || '')),
    tenantDocumentLabel: 'CNPJ',
    addressLine,
    cityUfLine,
    contractNumber,
    logoBase64,
    logoWidthMm: ESTRELA_DO_SUL_PDF_LOGO_MM.width,
    logoHeightMm: ESTRELA_DO_SUL_PDF_LOGO_MM.height,
    headerVariant: 'estrela-do-sul',
  };
}
