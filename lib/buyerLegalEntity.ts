/**
 * Comprador pessoa jurídica (CNPJ) e representantes legais.
 * Pessoa física permanece no fluxo atual: este módulo só atua com 14 dígitos.
 */

import { formatCpfCnpj, normalizeCpfCnpj, onlyDigits } from '@/lib/inputMasks';

export type BuyerPersonType = 'PF' | 'PJ';
export type BuyerSignatureMode = 'INDIVIDUAL' | 'JOINT';

export type BuyerRepresentativeInput = {
  full_name?: string | null;
  cpf?: string | null;
  rg?: string | null;
  rg_issuer?: string | null;
  rg_issuer_state?: string | null;
  nationality?: string | null;
  marital_status?: string | null;
  profession?: string | null;
  role_title?: string | null;
  phone?: string | null;
  email?: string | null;
  representation_document?: string | null;
  /** Na modalidade individual, exatamente um representante fica marcado. */
  signs?: boolean | null;
};

export type BuyerRepresentativeSigner = {
  fullName: string;
  cpfDigits: string;
  cpfFormatted: string;
  rg: string;
  rgIssuer: string;
  rgIssuerState: string;
  nationality: string;
  maritalStatus: string;
  profession: string;
  roleTitle: string;
  phone: string;
  email: string;
  representationDocument: string;
  qualification: string;
};

export type BuyerLegalEntityView = {
  personType: 'PJ';
  legalName: string;
  tradeName: string;
  cnpjDigits: string;
  cnpjFormatted: string;
  registrationStatus: string;
  addressLine: string;
  signatureMode: BuyerSignatureMode;
  signers: BuyerRepresentativeSigner[];
  qualificationText: string;
};

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function mod11(digits: string, weights: number[]): number {
  const sum = digits
    .split('')
    .reduce((acc, digit, index) => acc + Number(digit) * weights[index], 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

/** Dígitos verificadores do CPF. Não altera a validação por tamanho já usada no sistema. */
export function isValidCpfCheckDigits(value?: string | null): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  const first = mod11(digits.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = mod11(digits.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digits.endsWith(`${first}${second}`);
}

/** Dígitos verificadores do CNPJ. */
export function isValidCnpjCheckDigits(value?: string | null): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;
  const first = mod11(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = mod11(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digits.endsWith(`${first}${second}`);
}

export function buyerDocumentDigits(
  ...sources: Array<Record<string, unknown> | null | undefined>
): string {
  for (const source of sources) {
    if (!source) continue;
    const digits = normalizeCpfCnpj(
      String(source.cpf_cnpj || source.document || source.cpf || source.cnpj || ''),
    );
    if (digits.length === 11 || digits.length === 14) return digits;
  }
  return '';
}

/** 14 dígitos = PJ. 11 dígitos = PF. Documento incompleto não troca o formulário. */
export function resolveBuyerPersonType(
  ...sources: Array<Record<string, unknown> | string | null | undefined>
): BuyerPersonType | null {
  for (const source of sources) {
    if (source == null) continue;
    if (typeof source === 'string') {
      const digits = normalizeCpfCnpj(source);
      if (digits.length === 14) return 'PJ';
      if (digits.length === 11) return 'PF';
      const explicit = source.trim().toUpperCase();
      if (explicit === 'PJ' || explicit === 'PF') return explicit;
      continue;
    }
    const explicit = clean(source.person_type || source.buyer_person_type).toUpperCase();
    const digits = buyerDocumentDigits(source);
    if (digits.length === 14 || explicit === 'PJ') return 'PJ';
    if (digits.length === 11 || explicit === 'PF') return 'PF';
  }
  return null;
}

export function isBuyerLegalEntity(
  ...sources: Array<Record<string, unknown> | string | null | undefined>
): boolean {
  return resolveBuyerPersonType(...sources) === 'PJ';
}

function asRecordArray(value: unknown): BuyerRepresentativeInput[] {
  if (Array.isArray(value)) return value as BuyerRepresentativeInput[];
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? (parsed as BuyerRepresentativeInput[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function readBuyerRepresentatives(
  ...sources: Array<Record<string, unknown> | null | undefined>
): BuyerRepresentativeInput[] {
  for (const source of sources) {
    if (!source) continue;
    const raw =
      source.buyer_representatives_json ??
      source.legal_representatives ??
      source.legal_representatives_json;
    const list = asRecordArray(raw);
    if (list.length > 0) return list;
  }
  return [];
}

export function readBuyerSignatureMode(
  ...sources: Array<Record<string, unknown> | null | undefined>
): BuyerSignatureMode {
  for (const source of sources) {
    const mode = clean(source?.buyer_signature_mode || source?.signature_mode).toUpperCase();
    if (mode === 'JOINT' || mode === 'CONJUNTA') return 'JOINT';
    if (mode === 'INDIVIDUAL') return 'INDIVIDUAL';
  }
  return 'INDIVIDUAL';
}

export function representativeQualification(rep: BuyerRepresentativeInput): string {
  const base = [clean(rep.nationality), clean(rep.marital_status), clean(rep.profession)]
    .filter(Boolean)
    .join(', ');
  const role = clean(rep.role_title);
  if (!role) return base;
  const quality = `na qualidade de ${role}`;
  return base ? `${base}, ${quality}` : quality;
}

export function representativesDesignatedToSign(
  reps: BuyerRepresentativeInput[],
  mode: BuyerSignatureMode,
): BuyerRepresentativeInput[] {
  const filled = reps.filter((rep) => clean(rep.full_name) || clean(rep.cpf));
  if (mode === 'JOINT') return filled;
  const marked = filled.filter((rep) => rep.signs === true);
  if (marked.length > 0) return marked;
  if (filled.length === 1) return filled;
  return [];
}

export function validateBuyerRepresentatives(
  reps: BuyerRepresentativeInput[],
  mode: BuyerSignatureMode = 'INDIVIDUAL',
): { ok: true; signers: BuyerRepresentativeInput[] } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const filled = reps.filter((rep) => clean(rep.full_name) || clean(rep.cpf));
  if (filled.length === 0) {
    return { ok: false, errors: ['Representante legal'] };
  }
  filled.forEach((rep, index) => {
    const label = `Representante ${index + 1}`;
    if (!clean(rep.full_name)) errors.push(`${label}: nome`);
    if (!isValidCpfCheckDigits(rep.cpf)) errors.push(`${label}: CPF`);
  });
  const signers = representativesDesignatedToSign(filled, mode);
  if (mode === 'INDIVIDUAL' && signers.length !== 1) {
    errors.push('Selecione um representante para a assinatura individual');
  }
  if (mode === 'JOINT' && signers.length < 1) {
    errors.push('Informe os representantes da assinatura conjunta');
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, signers };
}

function joinClauses(parts: string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join('; ')} e ${parts[parts.length - 1]}`;
}

function addressAlreadyHas(line: string, part: string): boolean {
  const needle = part.trim().toLowerCase();
  if (!needle) return false;
  const haystack = line.toLowerCase();
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (needle.length <= 4) {
    return new RegExp(`(?:^|\\D)${escaped}(?:\\D|$)`).test(haystack);
  }
  return haystack.includes(needle);
}

export function buildBuyerAddressLine(source: Record<string, unknown> | null | undefined): string {
  const record = source || {};
  const street = clean(record.address || record.street);
  const number = clean(record.address_number || record.number || record.numero);
  const complement = clean(record.address_complement || record.complement || record.complemento);
  const neighborhood = clean(record.neighborhood || record.bairro);
  const city = clean(record.city || record.municipio);
  const uf = clean(record.state_uf || record.state || record.uf).toUpperCase();
  const cep = clean(record.zip_code || record.cep);

  let line = street;
  if (number && !addressAlreadyHas(line, number)) {
    line = line ? `${line}, ${number}` : number;
  }
  if (complement && !addressAlreadyHas(line, complement)) {
    line = line ? `${line} - ${complement}` : complement;
  }
  const tail = [
    neighborhood && !addressAlreadyHas(line, neighborhood) ? neighborhood : '',
    city && !addressAlreadyHas(line, city) ? [city, uf].filter(Boolean).join('/') : '',
    cep && !addressAlreadyHas(line.replace(/\D/g, ''), cep.replace(/\D/g, '')) ? `CEP ${cep}` : '',
  ].filter(Boolean);
  return [line, ...tail].filter(Boolean).join(', ');
}

function toSigner(rep: BuyerRepresentativeInput): BuyerRepresentativeSigner {
  const cpfDigits = onlyDigits(rep.cpf);
  return {
    fullName: clean(rep.full_name),
    cpfDigits,
    cpfFormatted: formatCpfCnpj(cpfDigits),
    rg: clean(rep.rg),
    rgIssuer: clean(rep.rg_issuer),
    rgIssuerState: clean(rep.rg_issuer_state).toUpperCase(),
    nationality: clean(rep.nationality),
    maritalStatus: clean(rep.marital_status),
    profession: clean(rep.profession),
    roleTitle: clean(rep.role_title),
    phone: clean(rep.phone),
    email: clean(rep.email),
    representationDocument: clean(rep.representation_document),
    qualification: representativeQualification(rep),
  };
}

export function buildBuyerLegalEntityView(
  ...sources: Array<Record<string, unknown> | null | undefined>
): BuyerLegalEntityView | null {
  if (!isBuyerLegalEntity(...sources)) return null;
  const primary = sources.find((source) => source && typeof source === 'object') || {};
  const digits = buyerDocumentDigits(...sources);
  const reps = readBuyerRepresentatives(...sources);
  const mode = readBuyerSignatureMode(...sources);
  const signers = representativesDesignatedToSign(reps, mode).map(toSigner);
  const legalName =
    clean(primary.name || primary.legal_name || primary.razao_social) || 'razão social não informada';
  const address = buildBuyerAddressLine(primary) || 'endereço não informado';
  const cnpjFormatted = formatCpfCnpj(digits) || digits;
  const verb =
    mode === 'JOINT' && signers.length > 1
      ? 'neste ato representada conjuntamente por'
      : 'neste ato representada por';
  const repText =
    signers.length > 0
      ? joinClauses(
          signers.map((signer) => {
            const qual = signer.qualification ? `, ${signer.qualification}` : '';
            const powers = signer.representationDocument
              ? `, conforme poderes estabelecidos em ${signer.representationDocument}`
              : '';
            return `${signer.fullName}${qual}, inscrito no CPF sob nº ${signer.cpfFormatted}${powers}`;
          }),
        )
      : 'seu representante legal, conforme poderes a serem comprovados em documento próprio';

  return {
    personType: 'PJ',
    legalName,
    tradeName: clean(primary.trade_name || primary.nome_fantasia || primary.fantasy_name),
    cnpjDigits: digits,
    cnpjFormatted,
    registrationStatus: clean(primary.registration_status || primary.situacao_cadastral),
    addressLine: address,
    signatureMode: mode,
    signers,
    qualificationText: `${legalName}, pessoa jurídica de direito privado, inscrita no CNPJ sob nº ${cnpjFormatted}, com sede em ${address}, ${verb} ${repText}`,
  };
}

/** Pagador das cobranças: razão social + CNPJ da pessoa jurídica. Nunca o CPF do representante. */
export function resolveChargePayer(customer: Record<string, unknown> | null | undefined): {
  name: string;
  documentDigits: string;
} {
  const name = clean(customer?.name || customer?.legal_name);
  const documentDigits = normalizeCpfCnpj(
    String(customer?.cpf_cnpj || customer?.document || ''),
  );
  return { name, documentDigits };
}

export function buyerSnapshotFromForm(form: {
  cpf_cnpj?: string | null;
  person_type?: string | null;
  buyer_signature_mode?: string | null;
  legal_representatives?: BuyerRepresentativeInput[] | null;
}): Record<string, unknown> {
  const personType = resolveBuyerPersonType(form.cpf_cnpj, form.person_type);
  if (personType !== 'PJ') {
    return {
      buyer_person_type: personType === 'PF' ? 'PF' : null,
      buyer_signature_mode: null,
      buyer_representatives_json: null,
    };
  }
  const mode = readBuyerSignatureMode(form as Record<string, unknown>);
  return {
    buyer_person_type: 'PJ',
    buyer_signature_mode: mode,
    buyer_representatives_json: form.legal_representatives || [],
  };
}

export function emptyBuyerRepresentative(): BuyerRepresentativeInput {
  return {
    full_name: '',
    cpf: '',
    rg: '',
    rg_issuer: '',
    rg_issuer_state: '',
    nationality: 'Brasileira',
    marital_status: '',
    profession: '',
    role_title: '',
    phone: '',
    email: '',
    representation_document: '',
    signs: true,
  };
}
