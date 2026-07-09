/**
 * Formatação de endereço, estado civil, vendedor e quadro resumo — SV LOTES 2.0.
 */

import { normalizeSellerFromCompany } from '@/lib/contractSeller';
import { formatContractSaleDateLongBr } from '@/lib/contractPaymentDates';
import { formatCpfCnpj } from '@/lib/inputMasks';

function pickString(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (!text) continue;
    const lower = text.toLowerCase();
    if (
      lower === 'não informado' ||
      lower === 'nao informado' ||
      lower === 'bairro não informado' ||
      lower === 'bairro nao informado' ||
      lower === 'undefined' ||
      lower === 'null'
    ) {
      continue;
    }
    return text;
  }
  return '';
}

function toTitleCase(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (a) => a.toUpperCase());
}

function normalizeTextForCompare(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function textIncludesFragment(haystack: string, needle: string): boolean {
  const normalizedHaystack = normalizeTextForCompare(haystack);
  const normalizedNeedle = normalizeTextForCompare(needle);
  if (!normalizedHaystack || !normalizedNeedle) return false;
  return normalizedHaystack.includes(normalizedNeedle);
}

function formatContractCep(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length !== 8) return String(raw || '').trim();
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function stripLegacySnTokens(value: string): string {
  let s = String(value || '').trim();
  if (!s) return '';

  s = s.replace(/,\s*S\/N\s*,/gi, ',');
  s = s.replace(/,\s*S\/N(?=\s*,|\s*$)/gi, '');
  s = s.replace(/^S\/N\s*,\s*/i, '');
  s = s.replace(/,\s*S\s*,/gi, ',');
  s = s.replace(/,\s*S(?=\s*,|\s*$)/gi, '');

  return s.replace(/\s+/g, ' ').replace(/,\s*,/g, ', ').replace(/,\s*$/g, '').trim();
}

function cleanStreetFragment(value: string): string {
  let s = String(value || '').trim();
  if (!s) return '';

  s = s.replace(/^Rua:\s*/i, 'Rua ');
  s = s.replace(/,\s*S\/N\s*Bairro:\s*$/i, '');
  s = s.replace(/,\s*Bairro:\s*$/i, '');
  s = s.replace(/,\s*Bairro\s*$/i, '');
  s = s.replace(/\s+Bairro:\s*$/i, '');
  s = s.replace(/\bBairro:\s*$/i, '');
  s = stripLegacySnTokens(s);

  return s.replace(/\s+/g, ' ').replace(/,\s*,/g, ', ').replace(/,\s*$/g, '').trim();
}

/** Monta endereço completo apenas com campos preenchidos (sem S/N automático). */
export function formatSvLotes2CompanyAddressLine(
  company: Record<string, unknown> | null | undefined,
): string {
  const seller = normalizeSellerFromCompany(company);
  const parts: string[] = [];

  const street = cleanStreetFragment(
    pickString(
      company?.address,
      company?.endereco,
      company?.contract_legal_address,
      seller.address !== 'Não informado' ? seller.address : '',
    ),
  );
  if (street) parts.push(toTitleCase(street));

  const neighborhood = pickString(
    company?.neighborhood,
    company?.bairro,
    company?.district,
  );
  const joinedSoFar = parts.join(', ');
  if (
    neighborhood &&
    !textIncludesFragment(joinedSoFar, neighborhood)
  ) {
    parts.push(toTitleCase(neighborhood));
  }

  const city =
    seller.city !== 'Não informado' ? toTitleCase(seller.city) : '';
  const state =
    seller.state !== 'Não informado' ? seller.state.toUpperCase() : '';
  const cityStateJoined = parts.join(', ');
  if (city && state) {
    const cityStateCompact = `${city}-${state}`;
    const cityStateSpaced = `${city} - ${state}`;
    if (
      !textIncludesFragment(cityStateJoined, cityStateCompact) &&
      !textIncludesFragment(cityStateJoined, cityStateSpaced) &&
      !textIncludesFragment(cityStateJoined, `${city}, ${state}`)
    ) {
      parts.push(cityStateCompact);
    }
  } else if (city && !textIncludesFragment(cityStateJoined, city)) {
    parts.push(city);
  } else if (state && !textIncludesFragment(cityStateJoined, state)) {
    parts.push(state);
  }

  const cepRaw = pickString(company?.zip_code, company?.cep, seller.zip);
  const cepFmt = cepRaw ? formatContractCep(cepRaw) : '';
  const joinedBeforeCep = parts.join(', ');
  if (
    cepFmt &&
    !textIncludesFragment(joinedBeforeCep, `CEP ${cepFmt}`) &&
    !textIncludesFragment(joinedBeforeCep, cepFmt)
  ) {
    parts.push(`CEP ${cepFmt}`);
  }

  return parts.join(', ');
}

export type SvLotes2SellerData = {
  displayName: string;
  documentFmt: string;
  documentLabel: string;
  addressLine: string;
  city: string;
  state: string;
  cepFmt: string;
  phone: string;
  email: string;
  representativeName: string;
  representativeCpfFmt: string;
  representativeRole: string;
  representativeEmail: string;
  representativePhone: string;
};

/** Dados do vendedor a partir de Configurações → Geral (somente SV LOTES 2.0). */
export function buildSvLotes2SellerFromCompany(
  company: Record<string, unknown> | null | undefined,
): SvLotes2SellerData {
  const seller = normalizeSellerFromCompany(company);

  const displayName = toTitleCase(
    pickString(
      company?.fantasy_name,
      company?.name,
      seller.name !== 'Não informado' ? seller.name : '',
      seller.razaoSocial !== 'Não informado' ? seller.razaoSocial : '',
    ),
  );

  const docRaw = pickString(company?.cnpj, company?.document, seller.cnpj);
  const docDigits = docRaw.replace(/\D/g, '');
  const documentLabel = docDigits.length === 11 ? 'CPF' : 'CNPJ';
  const documentFmt = docRaw ? formatCpfCnpj(docRaw) : '';

  const addressLine = formatSvLotes2CompanyAddressLine(company);
  const city =
    seller.city !== 'Não informado' ? toTitleCase(seller.city) : '';
  const state =
    seller.state !== 'Não informado' ? seller.state.toUpperCase() : '';
  const cepRaw = pickString(company?.zip_code, company?.cep, seller.zip);
  const cepFmt = cepRaw ? formatContractCep(cepRaw) : '';

  const phone = pickString(company?.phone, seller.phone);
  const email = pickString(company?.email, seller.email);

  const representativeName = toTitleCase(
    pickString(
      company?.legal_representative,
      company?.responsible_name,
      seller.representative !== 'Não informado' ? seller.representative : '',
    ),
  );
  const repCpfRaw = pickString(
    company?.representative_cpf,
    company?.responsible_cpf,
    seller.representativeCpf !== 'Não informado' ? seller.representativeCpf : '',
  );
  const representativeCpfFmt = repCpfRaw ? formatCpfCnpj(repCpfRaw) : '';
  const representativeRole = pickString(company?.legal_representative_role);
  const representativeEmail = pickString(company?.legal_representative_email);
  const representativePhone = pickString(company?.legal_representative_phone);

  return {
    displayName,
    documentFmt,
    documentLabel,
    addressLine,
    city,
    state,
    cepFmt,
    phone,
    email,
    representativeName,
    representativeCpfFmt,
    representativeRole,
    representativeEmail,
    representativePhone,
  };
}

/** Linha curta para cabeçalho PDF reduzido (sem repetir endereço completo). */
export function formatSvLotes2CityUfLine(
  company: Record<string, unknown> | null | undefined,
): string {
  const seller = normalizeSellerFromCompany(company);
  const city =
    seller.city !== 'Não informado' ? toTitleCase(seller.city) : '';
  const state =
    seller.state !== 'Não informado' ? seller.state.toUpperCase() : '';
  if (city && state) return `${city} - ${state}`;
  return city || state || '';
}

const GENDERED_CIVIL_STATES: Array<{
  match: RegExp;
  masculine: string;
  feminine: string;
}> = [
  { match: /^divorciad/i, masculine: 'Divorciado', feminine: 'Divorciada' },
  { match: /^casad/i, masculine: 'Casado', feminine: 'Casada' },
  { match: /^solteir/i, masculine: 'Solteiro', feminine: 'Solteira' },
  { match: /^viúv/i, masculine: 'Viúvo', feminine: 'Viúva' },
  { match: /^viuv/i, masculine: 'Viúvo', feminine: 'Viúva' },
  { match: /^separad/i, masculine: 'Separado', feminine: 'Separada' },
  { match: /^uniao\s*estavel/i, masculine: 'União Estável', feminine: 'União Estável' },
  { match: /^união\s*estável/i, masculine: 'União Estável', feminine: 'União Estável' },
];

const FEMININE_NAME_SUFFIXES = ['a', 'ia', 'ina', 'ela', 'ilde', 'ete', 'ane', 'ene'];

/** Heurística simples por primeiro nome — evita "Divorciado(a)" quando possível. */
export function inferLikelyFeminineName(personName: string): boolean {
  const first = String(personName || '')
    .trim()
    .split(/\s+/)[0]
    ?.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') || '';

  if (!first || first.length < 3) return false;

  const masculineExceptions = new Set([
    'luca',
    'joshua',
    'borba',
    'garcia',
    'costa',
    'silva',
  ]);
  if (masculineExceptions.has(first)) return false;

  return FEMININE_NAME_SUFFIXES.some((suffix) => first.endsWith(suffix));
}

export function formatGenderedCivilState(
  rawCivilState: string,
  personName: string,
): string {
  const raw = String(rawCivilState || '').trim();
  if (!raw) return raw;

  const normalized = raw
    .replace(/\(a\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  for (const rule of GENDERED_CIVIL_STATES) {
    if (rule.match.test(normalized) || rule.match.test(raw)) {
      return inferLikelyFeminineName(personName)
        ? rule.feminine
        : rule.masculine;
    }
  }

  if (/\(a\)/i.test(raw)) {
    const base = raw.replace(/\(a\)/gi, '').trim();
    if (inferLikelyFeminineName(personName) && !base.match(/[ae]$/i)) {
      return `${base}a`;
    }
    return base;
  }

  return toTitleCase(raw);
}

export function sanitizeNeighborhoodForContract(raw: string): string {
  const value = pickString(raw);
  return value ? toTitleCase(value) : '';
}

export type SvLotes2SummaryField = {
  label: string;
  value: string;
  span?: 1 | 2 | 3;
};

/** Linha de data no encerramento — ex.: Parauapebas – PA, 08 de julho de 2026. */
export function buildSvLotes2ContractSignatureDateLine(
  city: string,
  uf: string,
  sale: Record<string, unknown>,
): string {
  const cityClean = String(city || '').trim();
  const ufClean = String(uf || '').trim().toUpperCase();
  const cityUf =
    cityClean && cityClean.toLowerCase() !== 'não informado'
      ? ufClean
        ? `${cityClean} – ${ufClean}`
        : cityClean
      : '';

  const dateLong = formatContractSaleDateLongBr(sale);
  if (!cityUf && !dateLong) return '';
  if (!dateLong) return cityUf ? `${cityUf},` : '';
  return cityUf ? `${cityUf}, ${dateLong}.` : `${dateLong}.`;
}

export function buildSvLotes2SummaryGridHtml(fields: SvLotes2SummaryField[]): string {
  const cells = fields
    .map((field) => {
      const span = field.span || 1;
      const spanClass =
        span === 3 ? ' sv2-summary-cell--span3' : span === 2 ? ' sv2-summary-cell--span2' : '';
      const clean = String(field.value || '—').trim() || '—';
      return `
        <div class="sv2-summary-cell${spanClass}">
          <span class="sv2-summary-label">${field.label}</span>
          <span class="sv2-summary-value">${clean}</span>
        </div>`;
    })
    .join('');

  return `<div class="sv2-summary-grid">${cells}</div>`;
}
