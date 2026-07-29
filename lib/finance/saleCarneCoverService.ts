/**
 * Capa do Carnê — carga server-side (somente leitura) da venda + empresa.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { loadSaleContext } from '@/lib/finance/saleChargesService';
import { loadSaleScopedInstallments } from '@/lib/finance/saleChargesService';
import {
  buildClientPortalAbsoluteUrl,
  buildClientPortalDisplayUrl,
  buildCoverStatusMessage,
  collectCoverMissingFields,
  countCarneCoverInstallments,
  formatCoverCompanyDocument,
  formatCoverCompanyPhone,
  type SaleCarneCoverCompanyInfo,
  type SaleCarneCoverSummary,
} from '@/lib/finance/saleCarneCoverShared';
import { loadSvLotesLogoDataUrl } from '@/lib/brandLogoServer';

export class SaleCarneCoverError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'SaleCarneCoverError';
    this.status = status;
  }
}

async function loadCompanyForCover(
  admin: SupabaseClient,
  companyId: string,
): Promise<SaleCarneCoverCompanyInfo> {
  const { data, error } = await admin
    .from('companies')
    .select('id, name, fantasy_name, razao_social, cnpj, phone, email, logo_url')
    .eq('id', companyId)
    .maybeSingle();

  if (error) {
    throw new SaleCarneCoverError(`Erro ao carregar empresa: ${error.message}`, 500);
  }
  if (!data) {
    throw new SaleCarneCoverError('Empresa da venda não encontrada.', 404);
  }

  const legalName = String(
    data.razao_social || data.name || data.fantasy_name || '',
  ).trim();
  const tradeName = data.fantasy_name ? String(data.fantasy_name).trim() : null;
  const documentDigits = data.cnpj
    ? String(data.cnpj).replace(/\D/g, '') || null
    : null;
  const phoneRaw = data.phone ? String(data.phone).trim() || null : null;
  const email = data.email ? String(data.email).trim() || null : null;
  const logoUrl = data.logo_url ? String(data.logo_url).trim() || null : null;

  return {
    companyId: String(data.id),
    legalName,
    tradeName,
    documentDigits,
    documentFormatted: formatCoverCompanyDocument(documentDigits),
    logoUrl,
    phoneRaw,
    phoneFormatted: formatCoverCompanyPhone(phoneRaw),
    email,
  };
}

export async function getSaleCarneCoverSummary(
  admin: SupabaseClient,
  companyId: string,
  saleId: string,
): Promise<SaleCarneCoverSummary> {
  const context = await loadSaleContext(admin, companyId, saleId);
  const installments = await loadSaleScopedInstallments(admin, companyId, saleId);
  const installmentsCount = countCarneCoverInstallments(installments);
  const company = await loadCompanyForCover(admin, companyId);

  const portalUrl = buildClientPortalAbsoluteUrl();
  const portalDisplayUrl = buildClientPortalDisplayUrl(portalUrl);

  const missingFields = collectCoverMissingFields({
    customerName: context.customerName,
    projectName: context.projectName,
    quadra: context.quadra,
    lote: context.lote,
    installmentsCount,
    companyLegalName: company.legalName,
    companyPhone: company.phoneFormatted || company.phoneRaw,
    companyEmail: company.email,
    companyLogoUrl: company.logoUrl,
    companyDocument: company.documentFormatted || company.documentDigits,
  });

  const { canGenerate, statusMessage } = buildCoverStatusMessage(
    missingFields,
    installmentsCount,
  );

  return {
    saleId,
    companyId,
    customerName: context.customerName,
    projectName: context.projectName,
    quadra: context.quadra,
    lote: context.lote,
    contractNumber: context.contractNumber,
    installmentsCount,
    company,
    portalUrl,
    portalDisplayUrl,
    missingFields,
    canGenerate,
    statusMessage,
  };
}

/** Fetch remoto ou fallback institucional SV LOTES (nunca logo de outra empresa). */
export async function resolveCoverLogoDataUrl(
  logoUrl: string | null | undefined,
): Promise<string | null> {
  const url = String(logoUrl || '').trim();
  if (url) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 32) {
          const ct = String(res.headers.get('content-type') || '').toLowerCase();
          const isJpeg = ct.includes('jpeg') || ct.includes('jpg') || /\.jpe?g(\?|$)/i.test(url);
          const mime = isJpeg ? 'image/jpeg' : 'image/png';
          return `data:${mime};base64,${buf.toString('base64')}`;
        }
      }
    } catch (err) {
      console.warn('SALE_CARNE_COVER_LOGO_FETCH_FAILED', err);
    }
  }
  return loadSvLotesLogoDataUrl();
}
