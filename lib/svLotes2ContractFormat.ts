/**
 * Formatação de endereço, estado civil e quadro resumo — SV LOTES 2.0.
 */

import { normalizeSellerFromCompany } from '@/lib/contractSeller';

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
    .replace(/(?:^|\s)\S/g, (a) => a.toUpperCase())
    .replace(/\bS\/n\b/g, 'S/N');
}

function cleanStreetFragment(value: string): string {
  let s = String(value || '').trim();
  if (!s) return '';

  s = s.replace(/,\s*S\/N\s*$/i, '');
  s = s.replace(/,\s*S\s*$/i, '');
  s = s.replace(/,\s*Bairro:\s*$/i, '');
  s = s.replace(/,\s*Bairro\s*$/i, '');
  s = s.replace(/\s+Bairro:\s*$/i, '');
  s = s.replace(/\s+/g, ' ').replace(/,\s*,/g, ', ').replace(/,\s*$/g, '').trim();

  return s;
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
  if (
    neighborhood &&
    !street.toLowerCase().includes(neighborhood.toLowerCase())
  ) {
    parts.push(toTitleCase(neighborhood));
  }

  const city =
    seller.city !== 'Não informado' ? toTitleCase(seller.city) : '';
  const state =
    seller.state !== 'Não informado' ? seller.state.toUpperCase() : '';
  if (city && state) parts.push(`${city}-${state}`);
  else if (city) parts.push(city);
  else if (state) parts.push(state);

  return parts.join(', ');
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
