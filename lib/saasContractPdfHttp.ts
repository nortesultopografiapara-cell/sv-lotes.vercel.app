/**
 * HTTP helpers para servir PDF do contrato SaaS (download/inline).
 */

import type { CompanyContractRow } from '@/lib/saasContractService';
import { storedPdfMatchesExpectedContentVersion } from '@/lib/saasContractPdfContentDetect';
import { resolveStoredSaasContractContentVersion } from '@/lib/saasContractContent';

export type SaasContractPdfDisposition = 'inline' | 'attachment';

export type SaasContractPdfHttpMeta = {
  contractId?: string | null;
  pageCount?: number;
  clausesCount?: number;
  contractNumber: string;
  contentVersion?: number;
  source?: 'pdf_signed_url' | 'contract_url' | 'regenerated';
};

export function isPdfBytes(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

export function pdfBytesToLatinHeader(bytes: Uint8Array, max = 8): string {
  return Buffer.from(bytes.slice(0, max)).toString('latin1');
}

export async function fetchPdfBytesFromUrl(url: string): Promise<Uint8Array | null> {
  if (!url?.trim()) return null;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!isPdfBytes(bytes)) return null;
    return bytes;
  } catch (err) {
    console.warn('SAAS_CONTRACT_PDF_FETCH_FAILED', {
      url: url.slice(0, 120),
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Prioridade: PDF assinado final → draft gravado (se bater content_version) → null (regenerar). */
export async function fetchStoredSaasContractPdf(
  contract: CompanyContractRow | null | undefined,
  expectedContentVersion?: number,
): Promise<{ bytes: Uint8Array; source: 'pdf_signed_url' | 'contract_url' } | null> {
  if (!contract) return null;

  const contentVersion =
    expectedContentVersion ?? resolveStoredSaasContractContentVersion(contract);

  const signedUrl = contract.pdf_signed_url?.trim();
  if (signedUrl) {
    const signed = await fetchPdfBytesFromUrl(signedUrl);
    if (signed) return { bytes: signed, source: 'pdf_signed_url' };
  }

  const draftUrl = contract.contract_url?.trim();
  if (draftUrl) {
    const draft = await fetchPdfBytesFromUrl(draftUrl);
    if (draft && storedPdfMatchesExpectedContentVersion(draft, contentVersion)) {
      return { bytes: draft, source: 'contract_url' };
    }
    if (draft) {
      console.warn('SAAS_CONTRACT_STALE_DRAFT_PDF', {
        contract_id: contract.id,
        contract_number: contract.contract_number,
        expected_content_version: contentVersion,
      });
    }
  }

  return null;
}

export function buildSaasContractPdfHttpHeaders(
  disposition: SaasContractPdfDisposition,
  contractNumber: string,
  meta?: Pick<SaasContractPdfHttpMeta, 'pageCount' | 'clausesCount' | 'contentVersion'>,
): Record<string, string> {
  const filename = `contrato-saas-${contractNumber.replace(/[^\w-]+/g, '_')}.pdf`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/pdf',
    'Content-Disposition':
      disposition === 'attachment'
        ? `attachment; filename="${filename}"`
        : `inline; filename="${filename}"`,
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
  };
  if (meta?.pageCount != null) {
    headers['X-Saas-Contract-Pages'] = String(meta.pageCount);
  }
  if (meta?.clausesCount != null) {
    headers['X-Saas-Contract-Clauses'] = String(meta.clausesCount);
  }
  if (meta?.contentVersion != null) {
    headers['X-Saas-Contract-Content-Version'] = String(meta.contentVersion);
  }
  headers['X-Saas-Contract-Number'] = contractNumber;
  return headers;
}

export function createSaasContractPdfResponse(
  pdfBytes: Uint8Array,
  disposition: SaasContractPdfDisposition,
  meta: SaasContractPdfHttpMeta,
): Response {
  if (!isPdfBytes(pdfBytes)) {
    throw new Error('Buffer PDF inválido (cabeçalho %PDF ausente).');
  }

  const body = Buffer.from(pdfBytes);
  const headers = buildSaasContractPdfHttpHeaders(disposition, meta.contractNumber, meta);
  if (meta.source) {
    headers['X-Saas-Contract-Source'] = meta.source;
  }

  return new Response(body, {
    status: 200,
    headers: {
      ...headers,
      'Content-Length': String(body.byteLength),
    },
  });
}
