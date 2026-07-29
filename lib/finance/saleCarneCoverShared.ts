/**
 * Capa do Carnê — helpers client-safe (tipos, formatação, regras de exibição).
 * Sem dependência de Supabase / Node APIs.
 */

import { CLIENT_PORTAL_PATH } from '@/lib/portal-cliente/config';
import { formatCpfCnpj, onlyDigits } from '@/lib/inputMasks';
import { formatContractPhone } from '@/lib/saasContractFormat';
import { isCanceledFinanceReceipt } from '@/lib/finance/saleChargesShared';

/** Tipo documental para auditoria opcional / testes. */
export const SALE_CARNE_COVER_DOCUMENT_TYPE = 'COVER_BOOKLET' as const;

/**
 * Regra do card PARCELAS:
 * conta todas as linhas de `finance_receipts` da venda que NÃO estão canceladas
 * (inclui entrada, sinal, mensais, balão, pagas e pendentes).
 * Não depende de cobranças Asaas — a capa pode ser gerada antes dos boletos.
 */
export function countCarneCoverInstallments(
  installments: Array<{ status?: string | null }>,
): number {
  return installments.filter((r) => !isCanceledFinanceReceipt(r)).length;
}

export type SaleCarneCoverCompanyInfo = {
  companyId: string;
  legalName: string;
  tradeName: string | null;
  documentDigits: string | null;
  documentFormatted: string | null;
  logoUrl: string | null;
  phoneRaw: string | null;
  phoneFormatted: string | null;
  email: string | null;
};

export type SaleCarneCoverSummary = {
  saleId: string;
  companyId: string;
  customerName: string | null;
  projectName: string | null;
  quadra: string | null;
  lote: string | null;
  contractNumber: string | null;
  installmentsCount: number;
  company: SaleCarneCoverCompanyInfo;
  portalUrl: string;
  portalDisplayUrl: string;
  missingFields: string[];
  canGenerate: boolean;
  statusMessage: string;
};

export type SaleCarneCoverPdfInput = {
  customerName: string;
  projectName: string;
  quadra: string;
  lote: string;
  installmentsCount: number;
  companyLegalName: string;
  companyDocumentFormatted: string | null;
  companyPhoneFormatted: string | null;
  companyEmail: string | null;
  logoDataUrl: string | null;
  portalUrl: string;
  portalDisplayUrl: string;
};

/** Strings que NÃO podem existir como fallback fixo no template. */
export const SALE_CARNE_COVER_FORBIDDEN_FALLBACKS = [
  '64.435.850/0001-03',
  '64435850000103',
  'imobiliariamenezes@gmail.com',
  '(94) 99195-5918',
  '99195-5918',
  'MENESES IMOBILIÁRIA LTDA',
] as const;

export function formatCoverCompanyPhone(
  value: string | null | undefined,
): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const formatted = formatContractPhone(raw).trim();
  if (!formatted || formatted === 'Não informado' || formatted === '—') return null;
  return formatted;
}

export function formatCoverCompanyDocument(
  value: string | null | undefined,
): string | null {
  const digits = onlyDigits(value);
  if (digits.length !== 11 && digits.length !== 14) return null;
  const formatted = formatCpfCnpj(digits);
  return formatted || null;
}

export function resolvePublicAppBaseUrl(): string {
  const explicit =
    process.env.NEXT_PUBLIC_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    '';
  const raw = String(explicit || '').trim().replace(/\/$/, '');
  if (raw) {
    return raw.startsWith('http') ? raw : `https://${raw}`;
  }
  const vercel = String(process.env.VERCEL_URL || '').trim().replace(/\/$/, '');
  if (vercel) {
    return vercel.startsWith('http') ? vercel : `https://${vercel}`;
  }
  return 'https://www.svlotes.com.br';
}

export function buildClientPortalAbsoluteUrl(baseUrl?: string): string {
  const base = String(baseUrl || resolvePublicAppBaseUrl()).replace(/\/$/, '');
  return `${base}${CLIENT_PORTAL_PATH}`;
}

/** Texto curto para o card azul (sem protocolo). */
export function buildClientPortalDisplayUrl(absoluteUrl: string): string {
  return String(absoluteUrl || '')
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '');
}

export function sanitizeCarneCoverFilenamePart(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .toLowerCase();
}

export function buildSaleCarneCoverFilename(input: {
  customerName?: string | null;
  quadra?: string | null;
  lote?: string | null;
}): string {
  const cliente = sanitizeCarneCoverFilenamePart(input.customerName || 'cliente') || 'cliente';
  const quadra = sanitizeCarneCoverFilenamePart(input.quadra || 'quadra') || 'quadra';
  const lote = sanitizeCarneCoverFilenamePart(input.lote || 'lote') || 'lote';
  return `capa-carne-${cliente}-${quadra}-${lote}.pdf`;
}

export function collectCoverMissingFields(input: {
  customerName?: string | null;
  projectName?: string | null;
  quadra?: string | null;
  lote?: string | null;
  installmentsCount: number;
  companyLegalName?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  companyLogoUrl?: string | null;
  companyDocument?: string | null;
}): string[] {
  const missing: string[] = [];
  if (!String(input.customerName || '').trim()) missing.push('cliente');
  if (!String(input.projectName || '').trim()) missing.push('empreendimento');
  if (!String(input.quadra || '').trim()) missing.push('quadra');
  if (!String(input.lote || '').trim()) missing.push('lote');
  if (!Number.isFinite(input.installmentsCount) || input.installmentsCount <= 0) {
    missing.push('parcelas');
  }
  if (!String(input.companyLegalName || '').trim()) missing.push('empresa');
  if (!String(input.companyPhone || '').trim()) missing.push('telefone da empresa');
  if (!String(input.companyEmail || '').trim()) missing.push('e-mail da empresa');
  if (!String(input.companyLogoUrl || '').trim()) missing.push('logotipo');
  if (!String(input.companyDocument || '').trim()) missing.push('CNPJ/CPF da empresa');
  return missing;
}

export function buildCoverStatusMessage(
  missingFields: string[],
  installmentsCount: number,
): { canGenerate: boolean; statusMessage: string } {
  const blocking = missingFields.filter((f) =>
    ['cliente', 'empreendimento', 'quadra', 'lote', 'parcelas', 'empresa'].includes(f),
  );
  if (blocking.length > 0) {
    return {
      canGenerate: false,
      statusMessage: `Pendências: ${blocking.join(', ')}. Complete os dados antes de gerar a capa.`,
    };
  }
  if (installmentsCount <= 0) {
    return {
      canGenerate: false,
      statusMessage:
        'Não há parcelas financeiras ativas nesta venda. A capa do carnê não pode ser gerada.',
    };
  }
  const soft = missingFields.filter((f) =>
    ['telefone da empresa', 'e-mail da empresa', 'logotipo', 'CNPJ/CPF da empresa'].includes(
      f,
    ),
  );
  if (soft.length > 0) {
    return {
      canGenerate: true,
      statusMessage: `Capa disponível para geração. Atenção: ${soft.join(', ')} ausente(s) no cadastro da empresa.`,
    };
  }
  return {
    canGenerate: true,
    statusMessage: 'Capa disponível para geração',
  };
}

/** Quebra texto em no máximo `maxLines` linhas com fonte ajustável (para testes / PDF). */
export function wrapTextToLines(
  text: string,
  maxCharsPerLine: number,
  maxLines: number,
): string[] {
  const words = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxCharsPerLine) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length >= maxLines) break;
  }
  if (lines.length < maxLines && current) lines.push(current);
  return lines.slice(0, maxLines);
}

export function fitFontSizeForWidth(
  text: string,
  maxWidthChars: number,
  baseSize: number,
  minSize: number,
): number {
  const len = String(text || '').length;
  if (len <= maxWidthChars) return baseSize;
  const ratio = maxWidthChars / Math.max(len, 1);
  return Math.max(minSize, Math.round(baseSize * ratio * 10) / 10);
}
