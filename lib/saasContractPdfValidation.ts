/**
 * Validação do PDF do contrato SaaS (conteúdo, páginas, cláusulas).
 */

import { buildSaasContractDocumentText } from '@/lib/saasContractContent';
import type { SaasContractPdfInput } from '@/lib/saasContractContent';

export const SAAS_CONTRACT_REQUIRED_CLAUSES_COUNT = 24;
export const SAAS_CONTRACT_MIN_PAGE_COUNT = 3;
export const SAAS_CONTRACT_TITLE = 'CONTRATO DE LICENÇA DE SOFTWARE (SaaS)';
export const SAAS_REPORT_FORBIDDEN_TITLE = 'Relatório SaaS';

export type SaasContractPdfValidation = {
  byteLength: number;
  pageCount: number;
  clausesCount: number;
  hasTitle: boolean;
  hasLgpd: boolean;
  hasIntellectualProperty: boolean;
  hasInadimplencia: boolean;
  hasForoParauapebas: boolean;
  isNotSaasReport: boolean;
  ok: boolean;
  errors: string[];
};

/** Conta objetos de página no PDF gerado pelo jsPDF. */
export function countPdfPages(pdfBytes: Uint8Array): number {
  const raw = Buffer.from(pdfBytes).toString('latin1');
  const pageObjects = raw.match(/\/Type\s*\/Page\b/g);
  if (pageObjects?.length) return pageObjects.length;
  const countMatch = raw.match(/\/Count\s+(\d+)/);
  if (countMatch) return Number(countMatch[1]) || 0;
  return 0;
}

/** Texto aproximado embutido no PDF (suficiente para validar títulos e cláusulas). */
export function extractRoughPdfText(pdfBytes: Uint8Array): string {
  const raw = Buffer.from(pdfBytes).toString('latin1');
  const chunks: string[] = [];
  const re = /\(([^()\\]{4,})\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const part = m[1].replace(/\\n/g, ' ').trim();
    if (part.length >= 4) chunks.push(part);
  }
  return chunks.join(' ');
}

export function validateSaasContractPdfBytes(
  pdfBytes: Uint8Array,
  documentText?: string,
): SaasContractPdfValidation {
  const rough = `${extractRoughPdfText(pdfBytes)} ${documentText || ''}`.toLowerCase();
  const pageCount = countPdfPages(pdfBytes);
  const errors: string[] = [];

  const hasTitle =
    rough.includes('contrato de licença de software') ||
    rough.includes('contrato de licenca de software');
  const hasLgpd = rough.includes('lgpd');
  const hasIntellectualProperty = rough.includes('propriedade intelectual');
  const hasInadimplencia = rough.includes('inadimpl');
  const hasForoParauapebas = rough.includes('parauapebas');
  const isNotSaasReport = !rough.includes('relatório saas') && !rough.includes('relatorio saas');

  if (!hasTitle) errors.push('título do contrato SaaS ausente');
  if (!hasLgpd) errors.push('cláusula LGPD ausente');
  if (!hasIntellectualProperty) errors.push('cláusula de propriedade intelectual ausente');
  if (!hasInadimplencia) errors.push('cláusula de inadimplência ausente');
  if (!hasForoParauapebas) errors.push('foro Parauapebas/PA ausente');
  if (!isNotSaasReport) errors.push('PDF parece ser Relatório SaaS, não contrato');
  if (pageCount < SAAS_CONTRACT_MIN_PAGE_COUNT) {
    errors.push(`PDF com ${pageCount} página(s); mínimo ${SAAS_CONTRACT_MIN_PAGE_COUNT}`);
  }
  if (pdfBytes.byteLength < 5000) errors.push('PDF muito pequeno ou vazio');

  return {
    byteLength: pdfBytes.byteLength,
    pageCount,
    clausesCount: SAAS_CONTRACT_REQUIRED_CLAUSES_COUNT,
    hasTitle,
    hasLgpd,
    hasIntellectualProperty,
    hasInadimplencia,
    hasForoParauapebas,
    isNotSaasReport,
    ok: errors.length === 0,
    errors,
  };
}

export function validateSaasContractPdfInput(input: SaasContractPdfInput, pdfBytes: Uint8Array) {
  const documentText = buildSaasContractDocumentText(input);
  return validateSaasContractPdfBytes(pdfBytes, documentText);
}
