/**
 * Seletores html2pdf — isolados para não puxar template ARAGUAIA (e cadeia server)
 * para bundles client (ex.: app/contracts/page.tsx via contractPdfPostProcess).
 */
export const ARAGUAIA_HTML2PDF_PAGINATION_AVOID = [
  '.araguaia-clause-keep',
  '.araguaia-keep-together',
  '.araguaia-financial-item-1-3',
  '.araguaia-financial-item-8',
  '.araguaia-general-conditions-item-3',
  '.araguaia-general-conditions-item-4',
  '.araguaia-sixth-letter-b',
  '.araguaia-sixth-letter-c',
  '.araguaia-ninth-letter-c',
  '.contract-closing-and-signatures--araguaia',
  '.sv-contract-araguaia .signature-slot',
  '.sv-cert-official-block',
  '.sv-cert-official-inner',
  '.sv-cert-official',
] as const;
