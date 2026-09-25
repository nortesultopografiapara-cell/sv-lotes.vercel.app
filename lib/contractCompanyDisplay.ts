/**
 * Nome e endereço da empresa para contrato (HTML, PDF e visualização).
 */

import { normalizeSellerFromCompany } from "@/lib/contractSeller";
import { toContractTitleCase } from "@/lib/contractTitleCase";

function toTitleCase(str: string): string {
  return toContractTitleCase(str);
}

/** Limpa logradouro colado (Quadra/Lote). Não decide S/N. */
export function cleanCompanyAddressLine(address: string): string {
  let s = String(address || "").trim();
  if (!s) return "";

  s = s.replace(/,\s*S\s*$/i, ", S/N");
  s = s.replace(/,\s*S\/N\s*$/i, ", S/N");
  s = s.replace(/(\d+)\s*quadra\s*/gi, "$1, Quadra ");
  s = s.replace(/\bquadra\s+/gi, "Quadra ");
  s = s.replace(/(\d+)\s*lote\s*/gi, "$1, Lote ");
  s = s.replace(/\blote\s+/gi, "Lote ");
  s = s.replace(/\s+/g, " ").replace(/,\s*,/g, ", ");
  s = s.replace(/,\s*$/g, "");

  return s;
}

/**
 * Helper compartilhado (PADRAO e demais): se o cadastro não traz S/N, acrescenta.
 * Modelos com regra própria (LF/Estrela, Araguaia, Mundo Novo) não devem depender
 * deste append cego quando o endereço já tem número.
 */
export function normalizeCompanyAddressLine(address: string): string {
  const s = cleanCompanyAddressLine(address);
  if (!s) return "";
  if (/S\/N/i.test(s)) return s;
  return `${s}, S/N`;
}

export function getCompanyDisplayName(
  company: Record<string, unknown> | null | undefined,
): string {
  const seller = normalizeSellerFromCompany(company);
  const primary =
    seller.name !== "Não informado" ? seller.name : seller.razaoSocial;
  return toTitleCase(primary);
}

export function formatCompanyAddressForHeader(
  company: Record<string, unknown> | null | undefined,
): { addressLine: string; cityUfLine: string } {
  const seller = normalizeSellerFromCompany(company);
  const addressLine =
    seller.address !== "Não informado"
      ? toTitleCase(normalizeCompanyAddressLine(seller.address))
      : "";
  const city =
    seller.city !== "Não informado" ? toTitleCase(seller.city) : "";
  const state =
    seller.state !== "Não informado"
      ? seller.state.toUpperCase()
      : "";
  const cityUfLine =
    city && state ? `${city} - ${state}` : city || state || "";
  return { addressLine, cityUfLine };
}
