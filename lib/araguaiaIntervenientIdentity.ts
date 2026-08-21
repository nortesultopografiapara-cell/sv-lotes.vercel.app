/**
 * Identidade da INTERVENIENTE ARAGUAIA — mesma fonte do preâmbulo e do e-sign V2.
 * Company/tenant → razão social + CNPJ; representante = 1º promitente (Daniel).
 */

import { formatCpfCnpj, onlyDigits } from '@/lib/inputMasks';
import { ARAGUAIA_DEFAULT_SELLERS } from '@/lib/projectContractSellers';

/** Fallback legado quando a empresa do contrato não traz razão/CNPJ. */
export const ARAGUAIA_INTERVENIENT_FALLBACK_COMPANY_NAME =
  'R R NEGÓCIOS & SERVIÇOS LTDA';
export const ARAGUAIA_INTERVENIENT_FALLBACK_COMPANY_CNPJ = '57.590.706/0001-78';
export const ARAGUAIA_INTERVENIENT_FALLBACK_REPRESENTATIVE_NAME =
  'Daniel Roberto Rivelino de Sousa';
export const ARAGUAIA_INTERVENIENT_FALLBACK_REPRESENTATIVE_CPF =
  '820.912.262-20';

export type AraguaiaIntervenientIdentity = {
  companyName: string;
  companyCnpjDisplay: string;
  companyCnpjDigits: string;
  representativeName: string;
  representativeCpfDigits: string;
  /** true quando razão + CNPJ vieram da company do contrato. */
  usedCompanySource: boolean;
};

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

/**
 * Mesma regra de `buildAraguaiaContractContext` para interveniente.
 * Passar sempre a company/tenant do contrato no fluxo V2.
 */
export function resolveAraguaiaIntervenientIdentity(input?: {
  company?: Record<string, unknown> | null;
  sellers?: Array<{ name?: string | null; cpf?: string | null }> | null;
}): AraguaiaIntervenientIdentity {
  const company = input?.company || {};
  const seller1 = input?.sellers?.[0];
  const companyName =
    clean(company.razao_social) ||
    clean(company.fantasy_name) ||
    clean(company.name);
  const cnpjRaw = clean(company.cnpj || company.document);
  const cnpjDigits = onlyDigits(cnpjRaw);
  const usedCompanySource = Boolean(companyName && cnpjDigits.length >= 14);
  const representativeName =
    clean(seller1?.name) ||
    ARAGUAIA_DEFAULT_SELLERS[0]?.name ||
    ARAGUAIA_INTERVENIENT_FALLBACK_REPRESENTATIVE_NAME;
  const representativeCpfDigits =
    onlyDigits(seller1?.cpf || '') ||
    onlyDigits(ARAGUAIA_DEFAULT_SELLERS[0]?.cpf || '') ||
    onlyDigits(ARAGUAIA_INTERVENIENT_FALLBACK_REPRESENTATIVE_CPF);

  if (usedCompanySource) {
    return {
      companyName,
      companyCnpjDisplay: formatCpfCnpj(cnpjDigits) || cnpjRaw || cnpjDigits,
      companyCnpjDigits: cnpjDigits,
      representativeName,
      representativeCpfDigits,
      usedCompanySource: true,
    };
  }

  return {
    companyName: ARAGUAIA_INTERVENIENT_FALLBACK_COMPANY_NAME,
    companyCnpjDisplay: ARAGUAIA_INTERVENIENT_FALLBACK_COMPANY_CNPJ,
    companyCnpjDigits: onlyDigits(ARAGUAIA_INTERVENIENT_FALLBACK_COMPANY_CNPJ),
    representativeName,
    representativeCpfDigits,
    usedCompanySource: false,
  };
}
