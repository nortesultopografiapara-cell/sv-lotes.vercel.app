/**
 * Resolução e validação cadastral do beneficiário do carnê (client-safe helpers).
 */

import {
  formatCpfCnpj,
  isValidBrazilianTaxDocument,
  onlyDigits,
} from '@/lib/inputMasks';

export const SALE_CARNE_BENEFICIARY_MISSING_DOC_WARNING =
  'O CPF/CNPJ do beneficiário não foi localizado na conta recebedora nem no cadastro da empresa. Revise os dados antes de entregar o carnê ao cliente.';

export const SALE_CARNE_BENEFICIARY_DIVERGENCE_WARNING =
  'A conta recebedora possui CPF/CNPJ diferente do cadastro da empresa. O carnê utilizará os dados oficiais da conta Asaas.';

export type SaleCarneDocumentSource =
  | 'asaas'
  | 'financial_account'
  | 'company'
  | 'none';

export type SaleCarneNameSource =
  | 'asaas'
  | 'financial_account_beneficiary'
  | 'financial_account_name'
  | 'company_razao'
  | 'company_fantasy'
  | 'none';

export type SaleCarneBeneficiaryResolved = {
  name: string;
  documentDigits: string | null;
  documentFormatted: string | null;
  documentSource: SaleCarneDocumentSource;
  nameSource: SaleCarneNameSource;
  missingDocument: boolean;
  companyDocumentDivergence: boolean;
  warnings: string[];
};

/** Aceita somente CPF (11) ou CNPJ (14) completos. */
export function normalizeCarneTaxDocument(
  value: string | null | undefined,
): string | null {
  const digits = onlyDigits(value);
  if (!isValidBrazilianTaxDocument(digits)) return null;
  return digits;
}

export function formatCarneTaxDocument(
  value: string | null | undefined,
): string | null {
  const digits = normalizeCarneTaxDocument(value);
  if (!digits) return null;
  return formatCpfCnpj(digits) || null;
}

export function resolveSaleCarneBeneficiaryFromSources(input: {
  asaas?: {
    cpfCnpj?: string | null;
    companyName?: string | null;
  } | null;
  financialAccount?: {
    document?: string | null;
    beneficiaryName?: string | null;
    name?: string | null;
  } | null;
  company?: {
    cnpj?: string | null;
    razaoSocial?: string | null;
    fantasyName?: string | null;
  } | null;
}): SaleCarneBeneficiaryResolved {
  const asaasDoc = normalizeCarneTaxDocument(input.asaas?.cpfCnpj);
  const accountDoc = normalizeCarneTaxDocument(input.financialAccount?.document);
  const companyDoc = normalizeCarneTaxDocument(input.company?.cnpj);

  let documentDigits: string | null = null;
  let documentSource: SaleCarneDocumentSource = 'none';

  if (asaasDoc) {
    documentDigits = asaasDoc;
    documentSource = 'asaas';
  } else if (accountDoc) {
    documentDigits = accountDoc;
    documentSource = 'financial_account';
  } else if (companyDoc) {
    documentDigits = companyDoc;
    documentSource = 'company';
  }

  const asaasName = String(input.asaas?.companyName || '').trim();
  const accountBeneficiary = String(input.financialAccount?.beneficiaryName || '').trim();
  const accountName = String(input.financialAccount?.name || '').trim();
  const companyRazao = String(input.company?.razaoSocial || '').trim();
  const companyFantasy = String(input.company?.fantasyName || '').trim();

  let name = '';
  let nameSource: SaleCarneNameSource = 'none';
  if (asaasName) {
    name = asaasName;
    nameSource = 'asaas';
  } else if (accountBeneficiary) {
    name = accountBeneficiary;
    nameSource = 'financial_account_beneficiary';
  } else if (accountName) {
    name = accountName;
    nameSource = 'financial_account_name';
  } else if (companyRazao) {
    name = companyRazao;
    nameSource = 'company_razao';
  } else if (companyFantasy) {
    name = companyFantasy;
    nameSource = 'company_fantasy';
  } else {
    name = 'Beneficiário';
  }

  // Divergência: documento oficial da conta (Asaas ou local) ≠ empresa.
  // Não é divergência quando a própria fonte impressa é a empresa.
  const officialForCompare =
    documentSource === 'asaas' || documentSource === 'financial_account'
      ? documentDigits
      : asaasDoc || accountDoc;
  const companyDocumentDivergence = Boolean(
    officialForCompare && companyDoc && officialForCompare !== companyDoc,
  );

  const warnings: string[] = [];
  if (!documentDigits) {
    warnings.push(SALE_CARNE_BENEFICIARY_MISSING_DOC_WARNING);
  }
  if (companyDocumentDivergence) {
    warnings.push(SALE_CARNE_BENEFICIARY_DIVERGENCE_WARNING);
  }

  return {
    name,
    documentDigits,
    documentFormatted: documentDigits ? formatCpfCnpj(documentDigits) : null,
    documentSource,
    nameSource,
    missingDocument: !documentDigits,
    companyDocumentDivergence,
    warnings,
  };
}
