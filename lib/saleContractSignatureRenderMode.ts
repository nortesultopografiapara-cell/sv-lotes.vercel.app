/**
 * Modo explícito de renderização do bloco de assinaturas no PDF/HTML.
 * Evita inferência frágil por status/arquivo/hash.
 */

export const SALE_CONTRACT_SIGNATURE_RENDER_MODES = [
  'PHYSICAL_UNSIGNED',
  'ELECTRONIC_SIGNED',
] as const;

export type SaleContractSignatureRenderMode =
  (typeof SALE_CONTRACT_SIGNATURE_RENDER_MODES)[number];

export function isSaleContractSignatureRenderMode(
  value: unknown,
): value is SaleContractSignatureRenderMode {
  return (
    value === 'PHYSICAL_UNSIGNED' || value === 'ELECTRONIC_SIGNED'
  );
}

export function normalizeSaleContractSignatureRenderMode(
  value?: string | null,
): SaleContractSignatureRenderMode {
  const key = String(value || '')
    .trim()
    .toUpperCase();
  if (key === 'ELECTRONIC_SIGNED') return 'ELECTRONIC_SIGNED';
  return 'PHYSICAL_UNSIGNED';
}

/**
 * Documento final certificado ELECTRONIC_SIGNED só quando aggregate = SIGNED.
 * 1/6…5/6 não produzem artefato final assinado.
 */
export function canProduceElectronicSignedContractDocument(
  aggregateStatus?: string | null,
): boolean {
  return String(aggregateStatus || '').toUpperCase() === 'SIGNED';
}

/**
 * Seleção de artefato para download admin/portal.
 * SIGNED quando processo concluído e há URL (ou regeneração signed).
 * UNSIGNED caso contrário — nunca misturar.
 *
 * Se já existe pdf_signed_url, o artefato final prevalece mesmo se algum
 * status auxiliar ainda não refletir SIGNED (ex.: race de sync).
 */
export function resolveSaleContractDownloadArtifactKind(input: {
  signatureStatus?: string | null;
  contractStatus?: string | null;
  pdfSignedUrl?: string | null;
}): 'SIGNED' | 'UNSIGNED' {
  if (String(input.pdfSignedUrl || '').trim()) return 'SIGNED';
  const sig = String(input.signatureStatus || '').toUpperCase();
  const st = String(input.contractStatus || '')
    .toLowerCase()
    .trim();
  const fullySigned =
    sig === 'SIGNED' || st === 'assinado' || st === 'signed';
  if (!fullySigned) return 'UNSIGNED';
  return 'SIGNED';
}

/** Portal: após SIGNED (ou com PDF final), não servir HTML pré-assinatura. */
export function shouldBlockUnsignedFallbackAfterElectronicSign(input: {
  signatureStatus?: string | null;
  contractStatus?: string | null;
  pdfSignedUrl?: string | null;
}): boolean {
  return resolveSaleContractDownloadArtifactKind(input) === 'SIGNED';
}
