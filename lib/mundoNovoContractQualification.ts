/**
 * Qualificação das partes — exclusivo do modelo MUNDO_NOVO.
 * Não importa helpers do ARAGUAIA.
 */

import { normalizeCompanyAddressLine } from '@/lib/contractCompanyDisplay';
import { toContractTitleCase } from '@/lib/contractTitleCase';

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    const text = clean(value);
    if (!text) continue;
    const lower = text.toLowerCase();
    if (
      lower === 'não informado' ||
      lower === 'nao informado' ||
      lower === 'undefined' ||
      lower === 'null' ||
      lower === '-' ||
      lower === '—'
    ) {
      continue;
    }
    return text;
  }
  return '';
}

function normalizeForCompare(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function textIncludesFragment(haystack: string, needle: string): boolean {
  const h = normalizeForCompare(haystack);
  const n = normalizeForCompare(needle);
  if (!h || !n) return false;
  return h.includes(n);
}

export function stripMundoNovoRgLabelPrefix(raw: string): string {
  let s = clean(raw);
  const leading = /^(rg\s*(?:n[ºo°.]|n[uú]mero)?\s*)/i;
  let guard = 0;
  while (s && leading.test(s) && guard < 8) {
    s = s.replace(leading, '').trim();
    guard += 1;
  }
  return s;
}

export function formatMundoNovoRgAfterNumeroLabel(raw: string): string {
  return stripMundoNovoRgLabelPrefix(raw);
}

export function stripMundoNovoPresentedSnToken(raw: string): string {
  let s = clean(raw);
  if (!s) return '';
  const placeholder = '\u0000';
  s = s.replace(/S\s*[./]\s*N\.?/gi, placeholder);
  s = s.replace(/(^|[\s,;:/\-–—])SN(?=[\s,;:/\-–—]|$)/gi, `$1${placeholder}`);
  s = s.replace(/(^|[\s,;:/\-–—])S(?=[\s,;:/\-–—]|$)/gi, `$1${placeholder}`);
  s = s.replace(/\s*[,;:/\-–—]*\s*\u0000\s*[,;:/\-–—]*\s*/g, ', ');
  s = s.replace(/,\s*,+/g, ', ');
  s = s.replace(/\s+,/g, ',');
  s = s.replace(/,\s+/g, ', ');
  s = s.replace(/^[,\s\-–—/;]+|[,\s\-–—/;]+$/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

export function formatMundoNovoNeutralNationality(raw: string): string {
  const value = clean(raw);
  if (!value) return '';
  const n = normalizeForCompare(value).replace(/\(a\)/g, '');
  if (/^brasil(eir[oa]s?|ian[oa]s?)$/.test(n)) return 'Brasileiro(a)';
  return toContractTitleCase(value);
}

export function formatMundoNovoNeutralMaritalStatus(raw: string): string {
  const value = clean(raw);
  if (!value) return '';
  const n = normalizeForCompare(value).replace(/\(a\)/g, '');
  if (/^solteir[oa]s?$/.test(n)) return 'Solteiro(a)';
  if (/^casad[oa]s?$/.test(n)) return 'Casado(a)';
  if (/^divorciad[oa]s?$/.test(n)) return 'Divorciado(a)';
  if (/^vi[uú]v[oa]s?$/.test(n)) return 'Viúvo(a)';
  if (/^uniao\s+estavel$/.test(n)) return 'União estável';
  return toContractTitleCase(value);
}

export function formatMundoNovoPresentedResidence(
  raw: string | null | undefined,
): string {
  const value = clean(raw);
  if (!value) return '';
  const expanded = value
    .replace(/\bQD\.?\s*(\d+)/gi, 'Quadra $1')
    .replace(/\bLT\.?\s*(\d+)/gi, 'Lote $1');
  return stripMundoNovoPresentedSnToken(expanded);
}

const FEMININE_LOGRADOURO =
  /^(avenida|alameda|travessa|rodovia|estrada|rua|av|al|tv|rod)\b/;
const MASCULINE_LOGRADOURO =
  /^(loteamento|residencial|condominio|setor|bairro)\b/;

export function resolveMundoNovoResidencePreposition(
  address: string | null | undefined,
): 'na' | 'no' | 'em' {
  const token = normalizeForCompare(clean(address)).replace(/^[.,;:\-–—/\s]+/, '');
  if (!token) return 'em';
  if (FEMININE_LOGRADOURO.test(token)) return 'na';
  if (MASCULINE_LOGRADOURO.test(token)) return 'no';
  return 'em';
}

export function formatMundoNovoResidenceDomicilePhrase(
  rawAddress: string,
  escapedAddress: string,
): string {
  const place = clean(escapedAddress);
  if (!place) return '';
  const prep = resolveMundoNovoResidencePreposition(rawAddress);
  return `residente e domiciliado(a) ${prep} ${place}`;
}

export function formatMundoNovoSeatAddressFromCompany(
  company?: Record<string, unknown> | null,
): string {
  const c = company && typeof company === 'object' ? company : {};
  const streetRaw = pickString(c.contract_legal_address, c.address, c.endereco);
  const neighborhood = pickString(c.neighborhood, c.bairro);
  const city = pickString(c.city, c.cidade);
  const state = pickString(c.state, c.uf, c.state_uf);
  if (!streetRaw) return '';

  let expanded = streetRaw
    .replace(/\bQD\.?\s*(\d+)/gi, 'Quadra $1')
    .replace(/\bLT\.?\s*(\d+)/gi, 'Lote $1');
  let streetLine = normalizeCompanyAddressLine(expanded);
  streetLine = toContractTitleCase(streetLine).replace(/\bS\/n\b/g, 'S/N');
  streetLine = streetLine.replace(
    /\b(Ac|Al|Ap|Am|Ba|Ce|Df|Es|Go|Ma|Mt|Ms|Mg|Pa|Pb|Pr|Pe|Pi|Rj|Rn|Rs|Ro|Rr|Sc|Sp|Se|To)\b/g,
    (uf) => uf.toUpperCase(),
  );
  streetLine = streetLine
    .replace(/\s*[–—]\s*/g, ', ')
    .replace(/,\s*,+/g, ', ')
    .replace(/,\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  streetLine = stripMundoNovoPresentedSnToken(streetLine);

  const neighborhoodTitle = neighborhood ? toContractTitleCase(neighborhood) : '';
  const cityTitle = city ? toContractTitleCase(city) : '';
  const stateUf = state ? state.toUpperCase() : '';
  const cityUfLine =
    cityTitle && stateUf ? `${cityTitle} - ${stateUf}` : cityTitle || stateUf;

  const inlineParts: string[] = [];
  if (streetLine) inlineParts.push(streetLine);
  if (
    neighborhoodTitle &&
    !textIncludesFragment(inlineParts.join(', '), neighborhoodTitle)
  ) {
    inlineParts.push(neighborhoodTitle);
  }
  if (cityTitle && !textIncludesFragment(inlineParts.join(', '), cityTitle)) {
    inlineParts.push(cityUfLine || cityTitle);
  } else if (!cityTitle && stateUf && !textIncludesFragment(inlineParts.join(', '), stateUf)) {
    inlineParts.push(stateUf);
  }
  return stripMundoNovoPresentedSnToken(inlineParts.join(', '));
}
