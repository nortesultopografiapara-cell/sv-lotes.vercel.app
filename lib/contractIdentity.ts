/**
 * Texto de identificação (RG + órgão emissor + UF) para contratos HTML/PDF.
 * Aceita nomes do cadastro (rg, rg_issuer, rg_issuer_state) e aliases alternativos.
 */

export type IdentityDocumentSource = Record<string, unknown> | null | undefined;

const EMPTY_TOKENS = new Set(['', 'undefined', 'null', 'n/a', 'na', '-', '—']);

function pickClean(...values: unknown[]): string {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (!text) continue;
    if (EMPTY_TOKENS.has(text.toLowerCase())) continue;
    return text;
  }
  return '';
}

export function resolveIdentityDocumentFields(
  source: IdentityDocumentSource,
): { rg: string; issuer: string; issuerState: string } {
  const record = source && typeof source === 'object' ? source : {};
  return {
    rg: pickClean(record.rg_number, record.rg, record.document_rg),
    issuer: pickClean(
      record.issuing_authority,
      record.rg_issuer,
      record.orgao_emissor,
      record.orgaoEmissor,
    ),
    issuerState: pickClean(
      record.issuing_state,
      record.rg_issuer_state,
      record.uf_emissor,
      record.ufEmissor,
    ).toUpperCase(),
  };
}

function formatIssuerExpeditionPhrase(issuer: string, issuerState: string): string {
  if (!issuer && !issuerState) return '';

  if (issuer && issuerState) {
    const combined = issuer.includes('/') ? issuer : `${issuer}/${issuerState}`;
    return `expedida pela ${combined}`;
  }

  if (issuer) return `expedida pela ${issuer}`;
  return `expedida no estado de ${issuerState}`;
}

/**
 * Ex.: "Portador da Cédula de Identidade RG nº 3658956, expedida pela PC/PA"
 * Omite partes ausentes; retorna "" se não houver nenhum dado de identidade.
 */
export function formatContractIdentityDocumentPhrase(
  source: IdentityDocumentSource,
): string {
  const { rg, issuer, issuerState } = resolveIdentityDocumentFields(source);
  if (!rg && !issuer && !issuerState) return '';

  let phrase = rg
    ? `Portador da Cédula de Identidade RG nº ${rg}`
    : 'Portador da Cédula de Identidade';

  const expedition = formatIssuerExpeditionPhrase(issuer, issuerState);
  if (expedition) phrase += `, ${expedition}`;

  return phrase;
}

/** Sufixo com vírgula inicial para encaixar na qualificação da parte. */
export function formatContractIdentityDocumentSuffix(
  source: IdentityDocumentSource,
): string {
  const phrase = formatContractIdentityDocumentPhrase(source);
  return phrase ? `, ${phrase}` : '';
}

function pickField(source: IdentityDocumentSource, keys: string[]): string {
  const record = source && typeof source === 'object' ? source : {};
  return pickClean(...keys.map((key) => record[key]));
}

/** Cônjuge opcional — campos podem vir planos ou aninhados em `spouse`. */
export function extractSpouseIdentitySource(
  customer: IdentityDocumentSource,
): Record<string, unknown> | null {
  const record =
    customer && typeof customer === 'object'
      ? (customer as Record<string, unknown>)
      : null;
  if (!record || typeof record !== 'object') return null;

  const nested =
    record.spouse && typeof record.spouse === 'object'
      ? (record.spouse as Record<string, unknown>)
      : null;

  const name = pickField(record, [
    'spouse_name',
    'conjuge_name',
    'nome_conjuge',
    'nome_conjugue',
    'spouseName',
  ]) || (nested ? pickField(nested, ['name', 'full_name', 'nome']) : '');

  if (!name) return null;

  const pickSpouse = (keys: string[]) =>
    pickField(record, keys) || (nested ? pickField(nested, keys) : '');

  return {
    name,
    document: pickSpouse([
      'spouse_cpf',
      'conjuge_cpf',
      'spouse_document',
      'cpf',
      'document',
      'cpf_cnpj',
    ]),
    rg: pickSpouse(['spouse_rg', 'conjuge_rg', 'rg_number', 'rg']),
    issuing_authority: pickSpouse([
      'spouse_rg_issuer',
      'conjuge_rg_issuer',
      'issuing_authority',
      'rg_issuer',
    ]),
    issuing_state: pickSpouse([
      'spouse_rg_issuer_state',
      'conjuge_rg_issuer_state',
      'issuing_state',
      'rg_issuer_state',
    ]),
    profession: pickSpouse(['spouse_profession', 'conjuge_profession', 'profession']),
  };
}

/**
 * Trecho "casado(a) com NOME, CPF..., Portador da Cédula..." quando houver cônjuge cadastrado.
 */
export function formatContractSpouseQualificationSuffix(
  customer: IdentityDocumentSource,
): string {
  const spouse = extractSpouseIdentitySource(customer);
  if (!spouse?.name) return '';

  const spouseName = String(spouse.name).trim();
  const spouseCpf = pickClean(spouse.document);
  const spouseIdentity = formatContractIdentityDocumentSuffix(spouse);
  const spouseProfession = pickClean(spouse.profession);

  let text = `, casado(a) com ${spouseName}`;
  if (spouseCpf) text += `, CPF n° ${spouseCpf}`;
  if (spouseProfession) text += `, Profissão: ${spouseProfession}`;
  text += spouseIdentity;

  return text;
}

/** Identidade do representante legal da empresa vendedora (quando cadastrada). */
export function formatSellerRepresentativeIdentitySuffix(
  tenant: IdentityDocumentSource,
): string {
  const record = tenant && typeof tenant === 'object' ? tenant : {};
  const repSource: Record<string, unknown> = {
    rg_number: pickField(record, [
      'representative_rg',
      'legal_representative_rg',
      'responsible_rg',
    ]),
    rg: pickField(record, ['representative_rg', 'legal_representative_rg']),
    issuing_authority: pickField(record, [
      'representative_rg_issuer',
      'legal_representative_rg_issuer',
      'representative_issuing_authority',
    ]),
    rg_issuer: pickField(record, ['representative_rg_issuer', 'legal_representative_rg_issuer']),
    issuing_state: pickField(record, [
      'representative_rg_issuer_state',
      'legal_representative_rg_issuer_state',
      'representative_issuing_state',
    ]),
    rg_issuer_state: pickField(record, [
      'representative_rg_issuer_state',
      'legal_representative_rg_issuer_state',
    ]),
  };

  return formatContractIdentityDocumentSuffix(repSource);
}
