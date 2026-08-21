/**
 * Download read-only de PDF de contrato — Portal do Cliente.
 * Prioridade: pdf_signed_url → pdf_url → HTML salvo (somente se NÃO estiver eletronicamente assinado).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { readStoredContractHtml } from '@/lib/contractHtmlGlobal';
import { buildContractPdfChromeFromTenant } from '@/lib/contractPdfPostProcess';
import type { PortalContractRow } from '@/lib/portal-cliente/contractLookup';
import { fetchPdfBytesFromUrl } from '@/lib/saasContractPdfHttp';
import { buildSaleContractPdfFromHtml, loadTenantLogoBase64ForPdf } from '@/lib/saleContractPdf';
import { shouldBlockUnsignedFallbackAfterElectronicSign } from '@/lib/saleContractSignatureRenderMode';

export const PORTAL_CONTRACT_PDF_UNAVAILABLE_MESSAGE =
  'PDF do contrato ainda não disponível.';

export const PORTAL_CONTRACT_SIGNED_PDF_UNAVAILABLE_MESSAGE =
  'PDF assinado eletronicamente indisponível no momento. Tente novamente em instantes.';

export const PORTAL_CONTRACT_DOWNLOAD_PATH = '/api/portal-cliente/contract/download';

export type PortalContractPdfSource = 'pdf_signed_url' | 'pdf_url' | 'stored_html';

export class PortalContractPdfUnavailableError extends Error {
  constructor(message = PORTAL_CONTRACT_PDF_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = 'PortalContractPdfUnavailableError';
  }
}

export function resolvePortalContractPdfAvailability(
  contract: PortalContractRow,
  storedHtml?: string | null,
): boolean {
  const html =
    storedHtml ?? readStoredContractHtml(contract as Record<string, unknown>);
  const blockUnsigned = shouldBlockUnsignedFallbackAfterElectronicSign({
    signatureStatus: (contract as { signature_status?: string | null })
      .signature_status,
    contractStatus: contract.status,
  });
  if (blockUnsigned) {
    return Boolean(
      String(contract.pdf_signed_url || '').trim() ||
        String(contract.pdf_url || '').trim(),
    );
  }
  return Boolean(
    String(contract.pdf_signed_url || '').trim() ||
      String(contract.pdf_url || '').trim() ||
      String(html || '').trim(),
  );
}

export async function loadPortalContractPdfForDownload(
  admin: SupabaseClient,
  contract: PortalContractRow,
): Promise<{
  bytes: Uint8Array;
  source: PortalContractPdfSource;
  contractNumber: string;
}> {
  const contractNumber = String(
    contract.contract_number || contract.id || 'contrato',
  ).trim();
  const blockUnsignedFallback = shouldBlockUnsignedFallbackAfterElectronicSign({
    signatureStatus: (contract as { signature_status?: string | null })
      .signature_status,
    contractStatus: contract.status,
  });

  const signedUrl = String(contract.pdf_signed_url || '').trim();
  if (signedUrl) {
    const bytes = await fetchPdfBytesFromUrl(signedUrl);
    if (bytes) {
      return { bytes, source: 'pdf_signed_url', contractNumber };
    }
    if (blockUnsignedFallback) {
      throw new PortalContractPdfUnavailableError(
        PORTAL_CONTRACT_SIGNED_PDF_UNAVAILABLE_MESSAGE,
      );
    }
  } else if (blockUnsignedFallback) {
    // Assinado eletronicamente sem artefato final — não entregar HTML pré-assinatura.
    throw new PortalContractPdfUnavailableError(
      PORTAL_CONTRACT_SIGNED_PDF_UNAVAILABLE_MESSAGE,
    );
  }

  const pdfUrl = String(contract.pdf_url || '').trim();
  if (pdfUrl) {
    const bytes = await fetchPdfBytesFromUrl(pdfUrl);
    if (bytes) {
      return { bytes, source: 'pdf_url', contractNumber };
    }
  }

  const html = readStoredContractHtml(contract as Record<string, unknown>);
  if (html?.trim()) {
    const tenantId = String(
      contract.tenant_id || contract.company_id || '',
    ).trim();
    let tenant: Record<string, unknown> = {};
    if (tenantId) {
      const { data } = await admin
        .from('companies')
        .select('*')
        .eq('id', tenantId)
        .maybeSingle();
      tenant = (data as Record<string, unknown>) || {};
    }

    const logoBase64 = await loadTenantLogoBase64ForPdf(tenant);
    const chrome = buildContractPdfChromeFromTenant(
      tenant,
      contractNumber,
      logoBase64,
    );

    const bytes = await buildSaleContractPdfFromHtml(html, chrome);
    return { bytes, source: 'stored_html', contractNumber };
  }

  throw new PortalContractPdfUnavailableError();
}
