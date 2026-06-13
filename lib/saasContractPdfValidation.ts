/**
 * Validação do PDF do contrato SaaS (conteúdo, páginas, cláusulas).
 */

import { buildSaasContractDocumentText } from '@/lib/saasContractContent';
import type { SaasContractPdfInput } from '@/lib/saasContractContent';

export const SAAS_CONTRACT_REQUIRED_CLAUSES_COUNT = 24;
export const SAAS_CONTRACT_MIN_PAGE_COUNT = 3;
/** Faixa esperada para contrato Meneses com paginação natural (sem forçar 8/9 páginas). */
export const SAAS_CONTRACT_NATURAL_MAX_PAGE_COUNT = 10;
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

export type SaasContractPageDensity = {
  pageIndex: number;
  textLength: number;
  sparse: boolean;
};

/** Estima densidade de texto por página (heurística no stream PDF do jsPDF). */
export function analyzeSaasContractPageDensity(pdfBytes: Uint8Array): SaasContractPageDensity[] {
  const raw = Buffer.from(pdfBytes).toString('latin1');
  const pageChunks = raw.split(/\/Type\s*\/Page\b/);
  const densities: SaasContractPageDensity[] = [];

  for (let i = 1; i < pageChunks.length; i++) {
    const chunk = pageChunks[i];
    const streamEnd = chunk.indexOf('endstream');
    const content = streamEnd > 0 ? chunk.slice(0, streamEnd) : chunk.slice(0, 80_000);
    const texts = content.match(/\(([^()\\]{2,})\)/g) || [];
    const textLength = texts.reduce((sum, t) => sum + t.length - 2, 0);
    densities.push({ pageIndex: i, textLength, sparse: false });
  }

  if (densities.length === 0) return densities;

  const middle = densities.filter((d) => d.pageIndex > 1 && d.pageIndex < densities.length);
  const ref = middle.length > 0 ? middle : densities;
  const avg = ref.reduce((s, d) => s + d.textLength, 0) / ref.length;
  const threshold = Math.max(400, avg * 0.25);

  for (const d of densities) {
    d.sparse = d.pageIndex > 1 && d.pageIndex < densities.length && d.textLength < threshold;
  }

  return densities;
}

export function validateSaasContractNaturalPagination(pdfBytes: Uint8Array): {
  ok: boolean;
  pageCount: number;
  sparsePages: number[];
  errors: string[];
} {
  const pageCount = countPdfPages(pdfBytes);
  const densities = analyzeSaasContractPageDensity(pdfBytes);
  const sparsePages = densities.filter((d) => d.sparse).map((d) => d.pageIndex);
  const errors: string[] = [];

  if (pageCount > SAAS_CONTRACT_NATURAL_MAX_PAGE_COUNT) {
    errors.push(`PDF com ${pageCount} páginas; máximo natural ${SAAS_CONTRACT_NATURAL_MAX_PAGE_COUNT}`);
  }
  if (sparsePages.length > 0) {
    errors.push(`páginas com pouco conteúdo: ${sparsePages.join(', ')}`);
  }

  const rough = extractRoughPdfText(pdfBytes).toLowerCase();
  const clause24Pos = rough.lastIndexOf('cláusula 24');
  const signaturePos = rough.indexOf('página de assinatura');
  if (clause24Pos >= 0 && signaturePos >= 0 && signaturePos < clause24Pos) {
    errors.push('assinatura aparece antes da cláusula 24');
  }

  return { ok: errors.length === 0, pageCount, sparsePages, errors };
}
