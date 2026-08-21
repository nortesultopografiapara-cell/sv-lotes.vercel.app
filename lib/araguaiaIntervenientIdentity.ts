/**
 * Identidade da INTERVENIENTE ARAGUAIA — mesma fonte do preâmbulo e do e-sign V2.
 * Company/tenant → razão social + CNPJ;
 * Representante → Representante Legal da company (Configurações) = Vendedor 1.
 * Nunca usa Vendedor 2 como representante da PJ.
 */

import { formatCpfCnpj, onlyDigits } from '@/lib/inputMasks';
import { resolveAraguaiaCompanyLegalRepresentative } from '@/lib/araguaiaCompanyLegalRepresentative';

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
  representativeEmail: string | null;
  representativePhone: string | null;
  /** true quando razão + CNPJ vieram da company do contrato. */
  usedCompanySource: boolean;
};

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

/**
 * Passar sempre a company/tenant do contrato no fluxo V2.
 * Representante Legal da company — não “1º promitente” hardcoded.
 * mode 'v2': sem fallback R R / Daniel.
 */
export function resolveAraguaiaIntervenientIdentity(input?: {
  company?: Record<string, unknown> | null;
  /** @deprecated Ignorado — representante vem do Representante Legal da company. */
  sellers?: Array<{ name?: string | null; cpf?: string | null }> | null;
  mode?: 'legacy' | 'v2';
}): AraguaiaIntervenientIdentity {
  const company = input?.company || {};
  const mode = input?.mode === 'v2' ? 'v2' : 'legacy';
  const companyName =
    clean(company.razao_social) ||
    clean(company.fantasy_name) ||
    clean(company.name);
  const cnpjRaw = clean(company.cnpj || company.document);
  const cnpjDigits = onlyDigits(cnpjRaw);
  const usedCompanySource = Boolean(companyName && cnpjDigits.length >= 14);
  const legal = resolveAraguaiaCompanyLegalRepresentative(company);

  if (mode === 'v2') {
    return {
      companyName: usedCompanySource ? companyName : '',
      companyCnpjDisplay: usedCompanySource
        ? formatCpfCnpj(cnpjDigits) || cnpjRaw || cnpjDigits
        : '',
      companyCnpjDigits: usedCompanySource ? cnpjDigits : '',
      representativeName: legal.usedCompanySource ? legal.name : '',
      representativeCpfDigits: legal.usedCompanySource ? legal.cpfDigits : '',
      representativeEmail: legal.usedCompanySource ? legal.email : null,
      representativePhone: legal.usedCompanySource ? legal.phone : null,
      usedCompanySource,
    };
  }

  const representativeName = legal.usedCompanySource
    ? legal.name
    : ARAGUAIA_INTERVENIENT_FALLBACK_REPRESENTATIVE_NAME;
  const representativeCpfDigits = legal.usedCompanySource
    ? legal.cpfDigits
    : onlyDigits(ARAGUAIA_INTERVENIENT_FALLBACK_REPRESENTATIVE_CPF);

  if (usedCompanySource) {
    return {
      companyName,
      companyCnpjDisplay: formatCpfCnpj(cnpjDigits) || cnpjRaw || cnpjDigits,
      companyCnpjDigits: cnpjDigits,
      representativeName,
      representativeCpfDigits,
      representativeEmail: legal.usedCompanySource ? legal.email : null,
      representativePhone: legal.usedCompanySource ? legal.phone : null,
      usedCompanySource: true,
    };
  }

  return {
    companyName: ARAGUAIA_INTERVENIENT_FALLBACK_COMPANY_NAME,
    companyCnpjDisplay: ARAGUAIA_INTERVENIENT_FALLBACK_COMPANY_CNPJ,
    companyCnpjDigits: onlyDigits(ARAGUAIA_INTERVENIENT_FALLBACK_COMPANY_CNPJ),
    representativeName,
    representativeCpfDigits,
    representativeEmail: legal.usedCompanySource ? legal.email : null,
    representativePhone: legal.usedCompanySource ? legal.phone : null,
    usedCompanySource: false,
  };
}
