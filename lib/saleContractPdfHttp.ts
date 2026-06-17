/**
 * HTTP helpers para servir PDF de contrato de venda (assinatura pública).
 */

import { isPdfBytes } from '@/lib/saasContractPdfHttp';

export type SaleContractPdfDisposition = 'inline' | 'attachment';

export function buildSaleContractPdfFilename(contractNumber: string): string {
  const normalized = String(contractNumber || 'contrato')
    .trim()
    .replace(/[/\\]+/g, '_')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return `contrato-${normalized || 'contrato'}.pdf`;
}

export function buildSaleContractPdfHttpHeaders(
  disposition: SaleContractPdfDisposition,
  contractNumber: string,
): Record<string, string> {
  const filename = buildSaleContractPdfFilename(contractNumber);
  return {
    'Content-Type': 'application/pdf',
    'Content-Disposition':
      disposition === 'attachment'
        ? `attachment; filename="${filename}"`
        : `inline; filename="${filename}"`,
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
    'X-Sale-Contract-Number': contractNumber,
  };
}

export function createSaleContractPdfResponse(
  pdfBytes: Uint8Array,
  disposition: SaleContractPdfDisposition,
  contractNumber: string,
): Response {
  if (!isPdfBytes(pdfBytes)) {
    throw new Error('Buffer PDF inválido (cabeçalho %PDF ausente).');
  }

  const body = Buffer.from(pdfBytes);
  const headers = buildSaleContractPdfHttpHeaders(disposition, contractNumber);

  return new Response(body, {
    status: 200,
    headers: {
      ...headers,
      'Content-Length': String(body.byteLength),
    },
  });
}
