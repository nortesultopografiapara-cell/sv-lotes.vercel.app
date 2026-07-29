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
  mapCompanyRowToCoverInfo,
  SALE_CARNE_COVER_COMPANY_SELECT,
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
    .select(SALE_CARNE_COVER_COMPANY_SELECT)
    .eq('id', companyId)
    .maybeSingle();

  if (error) {
    throw new SaleCarneCoverError(`Erro ao carregar empresa: ${error.message}`, 500);
  }
  if (!data) {
    throw new SaleCarneCoverError('Empresa da venda não encontrada.', 404);
  }

  return mapCompanyRowToCoverInfo(data);
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
