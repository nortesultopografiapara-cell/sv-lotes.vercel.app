/**
 * Signatários eletrônicos — modelo ARAGUAIA (isolado).
 * Destino V2: 2 VENDOR PF + BUYER + INTERVENIENT + WITNESS_1 + WITNESS_2.
 * Sem SPOUSE. Persistência remota gated por shouldEnableAraguaiaEsignV2
 * (env + modelo ARAGUAIA + allowlist de company_id).
 */

import { getCpfCnpjValidationState, onlyDigits } from '@/lib/inputMasks';
import {
  ARAGUAIA_DEFAULT_SELLERS,
  formatSellerCpfDisplay,
} from '@/lib/projectContractSellers';
import {
  resolveAraguaiaCompanyLegalRepresentative,
  resolveAraguaiaPromitenteVendors,
  resolveCompanyContractVendors,
} from '@/lib/araguaiaCompanyLegalRepresentative';
import {
  ARAGUAIA_MISSING_LEGAL_REPRESENTATIVE_MESSAGE,
  isContractSecondVendorComplete,
  parseContractSecondVendorJson,
} from '@/lib/contractSecondVendor';
import { isValidSignerEmail, normalizeSignerEmail } from '@/lib/saleContractEmailValidation';
import { normalizeWhatsAppPhone } from '@/lib/whatsapp/clickToChat';
import type { SaleSignaturePartyRole } from '@/lib/saleContractSignaturePartyTypes';
import {
  isAraguaiaEsignV2EnvEnabled,
  shouldEnableAraguaiaEsignV2,
  type AraguaiaEsignV2GateInput,
} from '@/lib/araguaiaEsignV2Gate';

export { ARAGUAIA_MISSING_LEGAL_REPRESENTATIVE_MESSAGE };

/** @see isAraguaiaEsignV2EnvEnabled — flag bruta de ambiente. */
export function isAraguaiaEsignV2PersistEnabled(): boolean {
  return isAraguaiaEsignV2EnvEnabled();
}

/**
 * Persistência INTERVENIENT — exige gate completo (env + ARAGUAIA + allowlist).
 */
export function shouldPersistAraguaiaIntervenientParty(
  params: AraguaiaEsignV2GateInput = {},
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return shouldEnableAraguaiaEsignV2(params, env);
}

/**
 * Persistência WITNESS_* — exige gate completo (env + ARAGUAIA + allowlist).
 */
export function shouldPersistAraguaiaWitnessParties(
  params: AraguaiaEsignV2GateInput = {},
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return shouldEnableAraguaiaEsignV2(params, env);
}

/**
 * @deprecated Preferir shouldPersistAraguaiaIntervenientParty({ companyId, contractModel }).
 * Mantido false — NÃO hardcode true.
 */
export const ARAGUAIA_ESIGN_V2_PERSIST_INTERVENIENT = false;

/**
 * @deprecated Preferir shouldPersistAraguaiaWitnessParties({ companyId, contractModel }).
 * Mantido false — NÃO hardcode true.
 */
export const ARAGUAIA_ESIGN_V2_PERSIST_WITNESSES = false;

export type AraguaiaEsignVendor = {
  order: number;
  name: string;
  cpf: string;
  /** Dígitos brutos informados (DDD+número); normalizar via helper WhatsApp. */
  phoneRaw: string;
  email: string | null;
};

/** Contatos confirmados — Daniel mantém e-mail operacional; Aldenise sem e-mail pessoal. */
export const ARAGUAIA_DANIEL_ESIGN_EMAIL = 'rrnegocioseservicos@gmail.com';

/** Constantes legado / fallback — preferir resolveAraguaiaIntervenientIdentity({ company }). */
export {
  ARAGUAIA_INTERVENIENT_FALLBACK_REPRESENTATIVE_CPF as ARAGUAIA_INTERVENIENT_REPRESENTATIVE_CPF,
  ARAGUAIA_INTERVENIENT_FALLBACK_REPRESENTATIVE_NAME as ARAGUAIA_INTERVENIENT_REPRESENTATIVE_NAME,
  ARAGUAIA_INTERVENIENT_FALLBACK_COMPANY_NAME as ARAGUAIA_INTERVENIENT_COMPANY_NAME,
  ARAGUAIA_INTERVENIENT_FALLBACK_COMPANY_CNPJ as ARAGUAIA_INTERVENIENT_COMPANY_CNPJ,
  resolveAraguaiaIntervenientIdentity,
} from '@/lib/araguaiaIntervenientIdentity';
import {
  ARAGUAIA_INTERVENIENT_FALLBACK_COMPANY_CNPJ,
  ARAGUAIA_INTERVENIENT_FALLBACK_COMPANY_NAME,
  ARAGUAIA_INTERVENIENT_FALLBACK_REPRESENTATIVE_CPF,
  ARAGUAIA_INTERVENIENT_FALLBACK_REPRESENTATIVE_NAME,
  resolveAraguaiaIntervenientIdentity,
} from '@/lib/araguaiaIntervenientIdentity';

export type AraguaiaIntervenientPartyInput = {
  role: 'INTERVENIENT';
  name: string;
  /** CNPJ da empresa (dígitos) — gravado em signer_cpf da party. */
  cnpj: string;
  phone: string | null;
  email: string | null;
  /** Sem link público — assinatura administrativa. */
  withPublicToken: false;
  signatureData: AraguaiaIntervenientSignatureData;
};

export type AraguaiaIntervenientSignatureData = {
  party_kind: 'LEGAL_ENTITY';
  company_name: string;
  company_cnpj: string;
  representative_name: string;
  representative_cpf: string;
};

export const ARAGUAIA_ESIGN_VENDORS: AraguaiaEsignVendor[] = [
  {
    order: 1,
    name: ARAGUAIA_DEFAULT_SELLERS[0].name,
    cpf:
      ARAGUAIA_DEFAULT_SELLERS[0].cpf ||
      ARAGUAIA_INTERVENIENT_FALLBACK_REPRESENTATIVE_CPF,
    phoneRaw: '94991254320',
    email: ARAGUAIA_DANIEL_ESIGN_EMAIL,
  },
  {
    order: 2,
    name: ARAGUAIA_DEFAULT_SELLERS[1].name,
    cpf: ARAGUAIA_DEFAULT_SELLERS[1].cpf || '856.560.112-91',
    phoneRaw: '94991252923',
    email: null,
  },
];

export function isAraguaiaSaleContractModel(
  model?: string | null,
): boolean {
  const key = String(model || '')
    .trim()
    .toUpperCase();
  return key === 'ARAGUAIA' || key.includes('ARAGUAIA');
}

export function resolveAraguaiaEsignVendorPhone(
  phoneRaw: string,
): string | null {
  return normalizeWhatsAppPhone(phoneRaw);
}

function resolveAraguaiaVendorBuildMode(input?: {
  company?: Record<string, unknown> | null;
  companyId?: string | null;
  contractModel?: string | null;
  /** Força path V2 (Configurações) sem depender só do env gate. */
  mode?: 'legacy' | 'v2';
}): 'legacy' | 'v2' {
  if (input?.mode === 'v2' || input?.mode === 'legacy') return input.mode;
  const companyId =
    input?.companyId ||
    (input?.company ? String(input.company.id || '') : '') ||
    null;
  if (
    shouldEnableAraguaiaEsignV2({
      companyId,
      contractModel: input?.contractModel || 'ARAGUAIA',
    })
  ) {
    return 'v2';
  }
  return 'legacy';
}

/** Parties VENDOR a criar no envio ARAGUAIA — dinâmicas da company/projeto. */
export function buildAraguaiaEsignVendorPartyInputs(input?: {
  company?: Record<string, unknown> | null;
  project?: Record<string, unknown> | null;
  companyId?: string | null;
  contractModel?: string | null;
  mode?: 'legacy' | 'v2';
}): Array<{
  name: string;
  cpf: string;
  phone: string | null;
  email: string | null;
  order: number;
}> {
  const mode = resolveAraguaiaVendorBuildMode(input);
  const sellers = resolveAraguaiaPromitenteVendors({
    company: input?.company,
    project: mode === 'v2' ? null : input?.project,
    contractModel: 'ARAGUAIA',
    mode,
  });
  const legal = resolveAraguaiaCompanyLegalRepresentative(input?.company);
  const second = parseContractSecondVendorJson(
    input?.company?.contract_second_vendor_json,
  );
  const secondComplete = isContractSecondVendorComplete(second);

  return sellers.map((s, idx) => {
    const cpfDigits = onlyDigits(s.cpf || '') || String(s.cpf || '');
    const isLegalRep =
      legal.usedCompanySource &&
      onlyDigits(legal.cpfDigits) === onlyDigits(cpfDigits);
    const isSecond =
      mode === 'v2' &&
      secondComplete &&
      onlyDigits(second.cpf) === onlyDigits(cpfDigits);
    if (mode === 'v2') {
      return {
        name: s.name,
        cpf: cpfDigits,
        phone: isLegalRep
          ? legal.phone
          : isSecond
            ? normalizeWhatsAppPhone(second.phone) || second.phone || null
            : null,
        email: isLegalRep
          ? legal.email
          : isSecond
            ? second.email || null
            : null,
        order: s.order || idx + 1,
      };
    }
    const legacy = ARAGUAIA_ESIGN_VENDORS.find(
      (v) => onlyDigits(v.cpf) === onlyDigits(cpfDigits),
    );
    return {
      name: s.name,
      cpf: cpfDigits,
      phone: isLegalRep
        ? legal.phone
        : legacy
          ? resolveAraguaiaEsignVendorPhone(legacy.phoneRaw)
          : null,
      email: isLegalRep
        ? legal.email
        : legacy
          ? legacy.email
          : null,
      order: s.order || idx + 1,
    };
  });
}

/**
 * Valida Representante Legal no path V2 antes de novo contrato/processo.
 * Retorna mensagem de bloqueio ou null se ok.
 */
export function assertAraguaiaEsignV2LegalRepresentativeReady(input?: {
  company?: Record<string, unknown> | null;
}): string | null {
  const resolved = resolveCompanyContractVendors({ company: input?.company });
  return resolved.error;
}

export function buildAraguaiaIntervenientSignatureData(input?: {
  company?: Record<string, unknown> | null;
  sellers?: Array<{ name?: string | null; cpf?: string | null }> | null;
  mode?: 'legacy' | 'v2';
}): AraguaiaIntervenientSignatureData {
  const id = resolveAraguaiaIntervenientIdentity(input);
  return {
    party_kind: 'LEGAL_ENTITY',
    company_name: id.companyName,
    company_cnpj: id.companyCnpjDigits,
    representative_name: id.representativeName,
    representative_cpf: id.representativeCpfDigits,
  };
}

/**
 * Party INTERVENIENT (PJ) — distinta do VENDOR PF.
 * signer_cpf = CNPJ; representante = Representante Legal da company (= Vendedor 1).
 */
export function buildAraguaiaIntervenientPartyInput(input?: {
  company?: Record<string, unknown> | null;
  sellers?: Array<{ name?: string | null; cpf?: string | null }> | null;
  mode?: 'legacy' | 'v2';
}): AraguaiaIntervenientPartyInput {
  const id = resolveAraguaiaIntervenientIdentity(input);
  const data = buildAraguaiaIntervenientSignatureData(input);
  return {
    role: 'INTERVENIENT',
    name: data.company_name,
    cnpj: data.company_cnpj,
    phone: id.representativePhone,
    email: id.representativeEmail,
    withPublicToken: false,
    signatureData: data,
  };
}

/** Papéis obrigatórios do destino ARAGUAIA e-sign V2 (sem SPOUSE). */
export function buildAraguaiaEsignExpectedPartyRoles(input?: {
  company?: Record<string, unknown> | null;
  project?: Record<string, unknown> | null;
  companyId?: string | null;
  contractModel?: string | null;
  mode?: 'legacy' | 'v2';
}): SaleSignaturePartyRole[] {
  const vendors = buildAraguaiaEsignVendorPartyInputs(input);
  const vendorRoles = vendors.map(() => 'VENDOR' as const);
  return [
    ...vendorRoles,
    'BUYER',
    'INTERVENIENT',
    'WITNESS_1',
    'WITNESS_2',
  ];
}

export type AraguaiaWitnessPartyInput = {
  role: 'WITNESS_1' | 'WITNESS_2';
  name: null;
  cpf: null;
  phone: null;
  email: null;
  /** Link público — identidade preenchida pela própria testemunha. */
  withPublicToken: true;
};

/** Parties testemunha: identidade NULL até o link público. */
export function buildAraguaiaWitnessPartyInputs(): AraguaiaWitnessPartyInput[] {
  return [
    {
      role: 'WITNESS_1',
      name: null,
      cpf: null,
      phone: null,
      email: null,
      withPublicToken: true,
    },
    {
      role: 'WITNESS_2',
      name: null,
      cpf: null,
      phone: null,
      email: null,
      withPublicToken: true,
    },
  ];
}

export function isAraguaiaWitnessPartyRole(role?: string | null): boolean {
  const key = String(role || '').toUpperCase();
  return key === 'WITNESS_1' || key === 'WITNESS_2';
}

export type AraguaiaWitnessIdentityInput = {
  name?: string | null;
  cpf?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type AraguaiaWitnessIdentityValidated = {
  name: string;
  cpf: string;
  phone: string;
  email: string;
};

/**
 * Valida identidade obrigatória da testemunha no link público.
 * Não permite SIGNED com dados incompletos.
 */
export function validateAraguaiaWitnessIdentity(
  input: AraguaiaWitnessIdentityInput,
):
  | { ok: true; value: AraguaiaWitnessIdentityValidated }
  | { ok: false; reason: string } {
  const name = String(input.name || '').trim();
  if (!name) {
    return { ok: false, reason: 'Informe o nome completo da testemunha.' };
  }

  const cpfDigits = onlyDigits(input.cpf).slice(0, 11);
  const cpfState = getCpfCnpjValidationState(cpfDigits);
  if (!cpfState.isCompleteCpf) {
    return {
      ok: false,
      reason: cpfState.message || 'Informe um CPF válido da testemunha.',
    };
  }

  const phoneNormalized = normalizeWhatsAppPhone(String(input.phone || ''));
  if (!phoneNormalized) {
    return {
      ok: false,
      reason: 'Informe um telefone/WhatsApp válido da testemunha.',
    };
  }

  const email = normalizeSignerEmail(input.email);
  if (!isValidSignerEmail(email)) {
    return {
      ok: false,
      reason: 'Informe um e-mail válido da testemunha.',
    };
  }

  return {
    ok: true,
    value: {
      name,
      cpf: cpfDigits,
      phone: phoneNormalized,
      email,
    },
  };
}

export function readAraguaiaIntervenientFromSignatureData(
  signatureData?: Record<string, unknown> | null,
): AraguaiaIntervenientSignatureData | null {
  if (!signatureData || typeof signatureData !== 'object') return null;
  const companyName = String(signatureData.company_name || '').trim();
  const companyCnpj = onlyDigits(String(signatureData.company_cnpj || ''));
  const representativeName = String(
    signatureData.representative_name || '',
  ).trim();
  const representativeCpf = onlyDigits(
    String(signatureData.representative_cpf || ''),
  );
  if (!companyName || companyCnpj.length < 14) return null;
  return {
    party_kind: 'LEGAL_ENTITY',
    company_name: companyName,
    company_cnpj: companyCnpj,
    representative_name:
      representativeName || ARAGUAIA_INTERVENIENT_FALLBACK_REPRESENTATIVE_NAME,
    representative_cpf:
      representativeCpf ||
      onlyDigits(ARAGUAIA_INTERVENIENT_FALLBACK_REPRESENTATIVE_CPF),
  };
}

/** CPF do VENDOR Daniel ≠ CNPJ da INTERVENIENT — eventos/assinaturas distintos. */
export function isAraguaiaDanielVendorCpf(cpf?: string | null): boolean {
  return (
    araguaiaVendorCpfDigits(cpf) ===
    onlyDigits(ARAGUAIA_INTERVENIENT_FALLBACK_REPRESENTATIVE_CPF)
  );
}

export function isAraguaiaIntervenientParty(party: {
  role?: string | null;
  signer_cpf?: string | null;
  signature_data?: Record<string, unknown> | null;
}): boolean {
  if (String(party.role || '').toUpperCase() !== 'INTERVENIENT') return false;
  const fromData = readAraguaiaIntervenientFromSignatureData(party.signature_data);
  if (fromData) return true;
  // Qualquer party INTERVENIENT com documento (CNPJ) — sem amarrar a R R.
  return onlyDigits(party.signer_cpf || '').length >= 11;
}

export function formatAraguaiaEsignVendorCpfDisplay(cpf: string): string {
  return formatSellerCpfDisplay(cpf) || cpf;
}

export function araguaiaVendorCpfDigits(cpf?: string | null): string {
  return onlyDigits(cpf || '');
}

/** VENDOR PF ARAGUAIA conhecido (Daniel / Aldenise) pelo CPF. */
export function findAraguaiaEsignVendorByCpf(
  cpf?: string | null,
): AraguaiaEsignVendor | null {
  const digits = araguaiaVendorCpfDigits(cpf);
  if (!digits) return null;
  return (
    ARAGUAIA_ESIGN_VENDORS.find(
      (v) => araguaiaVendorCpfDigits(v.cpf) === digits,
    ) || null
  );
}

/**
 * E-mail persistido/exibido para VENDOR ARAGUAIA.
 * Aldenise (email configurado NULL): nunca herda buyer/customer/outro.
 * Daniel: mantém e-mail configurado se o submetido for inválido/vazio.
 * Demais VENDORs: sem override.
 */
export function resolveAraguaiaVendorSignerEmail(input: {
  cpf?: string | null;
  submittedEmail?: string | null;
}): string | null | undefined {
  const known = findAraguaiaEsignVendorByCpf(input.cpf);
  if (!known) return undefined;
  if (known.email === null) return null;
  const submitted = String(input.submittedEmail || '')
    .trim()
    .toLowerCase();
  if (submitted.includes('@')) return submitted;
  return known.email;
}

/**
 * Prefill público de e-mail no link de assinatura.
 * VENDOR nunca recebe fallback de customer/buyer.
 */
export function resolveSalePublicSignPrefillEmail(input: {
  partyRole?: string | null;
  partyEmail?: string | null;
  customerEmail?: string | null;
}): string | null {
  const role = String(input.partyRole || '')
    .trim()
    .toUpperCase();
  const partyEmail = String(input.partyEmail || '').trim() || null;
  if (role === 'VENDOR') return partyEmail;
  return (
    partyEmail ||
    String(input.customerEmail || '').trim() ||
    null
  );
}

/** Ordena VENDORs: Daniel (order 1) → Aldenise (order 2) → demais. */
export function sortAraguaiaVendorParties<
  T extends { signer_name?: string | null; signer_cpf?: string | null; created_at?: string },
>(parties: T[]): T[] {
  const orderOf = (p: T): number => {
    const cpf = araguaiaVendorCpfDigits(p.signer_cpf);
    const name = String(p.signer_name || '').toLowerCase();
    const known = ARAGUAIA_ESIGN_VENDORS.find(
      (v) =>
        araguaiaVendorCpfDigits(v.cpf) === cpf ||
        name.includes(v.name.split(' ')[0].toLowerCase()),
    );
    return known?.order ?? 99;
  };
  return [...parties].sort((a, b) => {
    const d = orderOf(a) - orderOf(b);
    if (d !== 0) return d;
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });
}

/** Detecta nome da INTERVENIENTE PJ (R R Negócios) em party.signer_name. */
export function isAraguaiaRrNegociosPartyName(name?: string | null): boolean {
  return /R\s*R\s*NEG[OÓ]CIOS/i.test(String(name || ''));
}

export const ARAGUAIA_RR_NOT_SIGNATURE_PARTY_MESSAGE =
  'R R Negócios não deve ser signatária no modelo ARAGUAIA.';

/**
 * V1: R R nunca pode ser party eletrônica.
 * V2 (gate ON): R R só como INTERVENIENT.
 */
export function araguaiaAllowsRrNegociosSignatureParty(
  params: {
    companyId?: string | null;
    contractModel?: string | null;
    partyRole?: string | null;
  },
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (
    !shouldEnableAraguaiaEsignV2(
      {
        companyId: params.companyId,
        contractModel: params.contractModel,
      },
      env,
    )
  ) {
    return false;
  }
  return (
    String(params.partyRole || '')
      .trim()
      .toUpperCase() === 'INTERVENIENT'
  );
}

/**
 * Pós-persistência: party com nome R R Negócios fora do papel permitido.
 * Retorna a party inválida ou null se todas as R R forem permitidas.
 */
export function findDisallowedAraguaiaRrSignatureParty(
  params: {
    parties: Array<{ role?: string | null; signer_name?: string | null }>;
    companyId?: string | null;
    contractModel?: string | null;
  },
  env: NodeJS.ProcessEnv = process.env,
): { role: string; signer_name: string } | null {
  for (const p of params.parties) {
    if (!isAraguaiaRrNegociosPartyName(p.signer_name)) continue;
    if (
      araguaiaAllowsRrNegociosSignatureParty(
        {
          companyId: params.companyId,
          contractModel: params.contractModel,
          partyRole: p.role,
        },
        env,
      )
    ) {
      continue;
    }
    return {
      role: String(p.role || ''),
      signer_name: String(p.signer_name || ''),
    };
  }
  return null;
}
