/**
 * Nome da loteadora/vendedora no Portal do Cliente.
 * Alinha-se ao “Promitente Proprietário Vendedor” do contrato
 * (getCompanyDisplayName / HTML persistido).
 */

import { getCompanyDisplayName } from '@/lib/contractCompanyDisplay';

const FALLBACK = 'Não informado';

function isBlankOrGeneric(value: string): boolean {
  const t = value.trim();
  if (!t) return true;
  const n = t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    n === 'empresa' ||
    n === 'loteadora' ||
    n === 'imobiliaria' ||
    n === 'nao informado' ||
    n === 'n/a' ||
    n === '-' ||
    n === '—'
  );
}

function cleanDisplayName(value: string | null | undefined): string | null {
  const t = String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || isBlankOrGeneric(t)) return null;
  return t;
}

/**
 * Extrai o nome do vendedor do HTML do contrato (mesma fonte que o PDF/visualização).
 */
export function extractLoteadoraNameFromContractHtml(
  html: string | null | undefined,
): string | null {
  if (!html || typeof html !== 'string') return null;

  const patterns: RegExp[] = [
    /Promitente\s+Propriet[aá]rio\s+Vendedor:?\s*(?:<\/strong>\s*)?(?:<strong>)?([^<,]+)/i,
    /PROMITENTE\s+VENDEDOR(?:\(A\))?:?\s*(?:<\/strong>\s*)?(?:<strong>)?([^<,]+)/i,
    /Promitente\s+Vendedor:?\s*(?:<\/strong>\s*)?(?:<strong>)?([^<,]+)/i,
    /PROMITENTE\s+PROPRIET[AÁ]RIO\s+VENDEDOR:?\s*(?:<\/strong>\s*)?(?:<strong>)?([^<,]+)/i,
  ];

  for (const re of patterns) {
    const match = html.match(re);
    if (match?.[1]) {
      const cleaned = cleanDisplayName(match[1]);
      if (cleaned) return cleaned;
    }
  }
  return null;
}

/**
 * Pessoa jurídica / física a partir do cadastro da empresa (tenant/vendedor).
 * Reutiliza getCompanyDisplayName do contrato (fantasia → name/razão).
 * PF: nome completo em name/fantasy_name; CPF pode estar em cnpj (11 dígitos).
 * Ignora placeholders genéricos (“Empresa”, “Loteadora”, “Imobiliária”).
 */
export function resolveVendorDisplayNameFromCompany(
  company: Record<string, unknown> | null | undefined,
): string | null {
  if (!company || typeof company !== 'object') return null;

  const fantasyRaw = String(company.fantasy_name || '').trim();
  const nameRaw = String(company.name || '').trim();
  const razaoRaw = String(company.razao_social || '').trim();

  const sanitized: Record<string, unknown> = {
    ...company,
    fantasy_name: isBlankOrGeneric(fantasyRaw) ? '' : fantasyRaw,
    name: isBlankOrGeneric(nameRaw) ? '' : nameRaw,
    razao_social: isBlankOrGeneric(razaoRaw) ? '' : razaoRaw,
  };

  const fromContractHelper = cleanDisplayName(getCompanyDisplayName(sanitized));
  if (fromContractHelper) return fromContractHelper;

  for (const candidate of [
    sanitized.fantasy_name,
    sanitized.razao_social,
    sanitized.name,
  ]) {
    const cleaned = cleanDisplayName(String(candidate || ''));
    if (cleaned) return cleaned;
  }

  return null;
}

export type ResolveSaleLoteadoraInput = {
  /** Nome explícito do vendedor/proprietário (venda/contrato), se houver. */
  explicitSellerName?: string | null;
  /** HTML persistido do contrato (generated_html etc.). */
  contractHtml?: string | null;
  /** Empresa/company_id da venda (pode ser PJ ou PF). */
  company?: Record<string, unknown> | null;
  /** Empresa tenant (fallback). */
  tenantCompany?: Record<string, unknown> | null;
  /** Proprietário do empreendimento, se disponível. */
  projectOwnerName?: string | null;
};

/**
 * Resolve o nome exibido como “Loteadora” no Resumo da Venda.
 *
 * Prioridade:
 * 1. vendedor explícito;
 * 2. nome no HTML do contrato (Promitente Proprietário Vendedor);
 * 3. company da venda (mesma lógica do contrato);
 * 4. proprietário do empreendimento;
 * 5. tenant company;
 * 6. “Não informado” — nunca “Empresa”.
 */
export function resolveSaleLoteadoraDisplayName(
  input: ResolveSaleLoteadoraInput,
): string {
  const explicit = cleanDisplayName(input.explicitSellerName);
  if (explicit) return explicit;

  const fromHtml = extractLoteadoraNameFromContractHtml(input.contractHtml);
  if (fromHtml) return fromHtml;

  const fromSaleCompany = resolveVendorDisplayNameFromCompany(input.company);
  if (fromSaleCompany) return fromSaleCompany;

  const fromProject = cleanDisplayName(input.projectOwnerName);
  if (fromProject) return fromProject;

  const fromTenant = resolveVendorDisplayNameFromCompany(input.tenantCompany);
  if (fromTenant) return fromTenant;

  return FALLBACK;
}
