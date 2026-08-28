/**
 * Seletores html2pdf — isolados do ARAGUAIA.
 */
const MUNDO_NOVO_HTML2PDF_CLAUSE_AVOID = [
  '.mundo-novo-clause-keep',
  '.mundo-novo-keep-together',
  '.mundo-novo-financial-item-1-3',
  '.mundo-novo-financial-item-8',
  '.mundo-novo-general-conditions-item-3',
  '.mundo-novo-general-conditions-item-4',
  '.mundo-novo-seventh-letter-b',
  '.mundo-novo-seventh-letter-c',
  '.mundo-novo-tenth-letter-c',
] as const;

/** Contrato físico — fecho + linhas de assinatura permanecem indivisíveis. */
export const MUNDO_NOVO_HTML2PDF_PAGINATION_AVOID = [
  ...MUNDO_NOVO_HTML2PDF_CLAUSE_AVOID,
  '.contract-closing-and-signatures--mundo-novo',
  '.sv-contract-mundo-novo .signature-slot',
] as const;

/**
 * PDF ELECTRONIC_SIGNED — fecho+cards+certificado na última página.
 * Não listar o wrapper, o grid nem o certificado: html2pdf trataria
 * cada avoid de forma independente e empurraria o certificado à pág. 8.
 * Cards individuais não se partem no meio.
 */
export const MUNDO_NOVO_ELECTRONIC_HTML2PDF_PAGINATION_AVOID = [
  ...MUNDO_NOVO_HTML2PDF_CLAUSE_AVOID,
  '.sv-contract-mundo-novo .signature-slot--electronic',
] as const;

export function isMundoNovoElectronicSignedHtml(html?: string | null): boolean {
  const raw = String(html || '');
  return (
    raw.includes('sv-contract-mundo-novo') &&
    raw.includes('data-signature-mode="ELECTRONIC_SIGNED"')
  );
}

export function resolveMundoNovoHtml2pdfAvoid(html?: string | null): readonly string[] {
  return isMundoNovoElectronicSignedHtml(html)
    ? MUNDO_NOVO_ELECTRONIC_HTML2PDF_PAGINATION_AVOID
    : MUNDO_NOVO_HTML2PDF_PAGINATION_AVOID;
}
