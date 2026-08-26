/**
 * Formatação de qualificação das partes — exclusivo do modelo ARAGUAIA.
 * Não altera PADRAO, MENESES, RECANTO_PRIMAVERA nem SV_LOTES_2.
 * Não grava cadastro: só apresentação no HTML/PDF.
 */

import { normalizeCompanyAddressLine } from '@/lib/contractCompanyDisplay';
import { toContractTitleCase } from '@/lib/contractTitleCase';
import { ARAGUAIA_SELLERS_ADDRESS } from '@/lib/projectContractSellers';

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

/** Remove prefixos RG / RG nº / RG n° repetidos; preserva o restante do documento. */
export function stripAraguaiaRgLabelPrefix(raw: string): string {
  let s = clean(raw);
  const leading = /^(rg\s*(?:n[ºo°.]|n[uú]mero)?\s*)/i;
  let guard = 0;
  while (s && leading.test(s) && guard < 8) {
    s = s.replace(leading, '').trim();
    guard += 1;
  }
  return s;
}

export function formatAraguaiaRgAfterNumeroLabel(raw: string): string {
  return stripAraguaiaRgLabelPrefix(raw);
}

/** Brasileira / Brasileiro / Brazilian → Brasileiro(a). Outras nacionalidades: cadastro. */
export function formatAraguaiaNeutralNationality(raw: string): string {
  const value = clean(raw);
  if (!value) return '';
  const n = normalizeForCompare(value).replace(/\(a\)/g, '');
  if (/^brasil(eir[oa]s?|ian[oa]s?)$/.test(n)) return 'Brasileiro(a)';
  return toContractTitleCase(value);
}

/** Solteiro/Solteira → Solteiro(a); Casado/Casada → Casado(a). Sem inventar se vazio. */
export function formatAraguaiaNeutralMaritalStatus(raw: string): string {
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

export function formatAraguaiaSeatAddressParts(company?: Record<string, unknown> | null): {
  streetLine: string;
  neighborhood: string;
  cityUfLine: string;
  headerAddressLine: string;
  fullInline: string;
} {
  const c = company && typeof company === 'object' ? company : {};
  const streetRaw = pickString(
    c.contract_legal_address,
    c.address,
    c.endereco,
  );
  const neighborhood = pickString(c.neighborhood, c.bairro);
  const city = pickString(c.city, c.cidade);
  const state = pickString(c.state, c.uf, c.state_uf);
  const neighborhoodTitle = neighborhood ? toContractTitleCase(neighborhood) : '';

  if (!streetRaw) {
    return {
      streetLine: ARAGUAIA_SELLERS_ADDRESS,
      neighborhood: neighborhoodTitle,
      cityUfLine: '',
      headerAddressLine: ARAGUAIA_SELLERS_ADDRESS,
      fullInline: ARAGUAIA_SELLERS_ADDRESS,
    };
  }

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

  const headerAddressLine = [
    streetLine,
    neighborhoodTitle && !textIncludesFragment(streetLine, neighborhoodTitle)
      ? neighborhoodTitle
      : '',
  ]
    .filter(Boolean)
    .join(', ');

  return {
    streetLine,
    neighborhood: neighborhoodTitle,
    cityUfLine,
    headerAddressLine,
    fullInline: inlineParts.join(', '),
  };
}

/** Endereço de parte: rua cadastrada + bairro/cidade da empresa, sem duplicar. */
export function formatAraguaiaPartyAddress(
  street: string | null | undefined,
  company?: Record<string, unknown> | null,
): string {
  const c = company && typeof company === 'object' ? company : {};
  const streetRaw = pickString(
    street,
    c.contract_legal_address,
    c.address,
    c.endereco,
  );
  return formatAraguaiaSeatAddressParts({
    address: streetRaw,
    neighborhood: c.neighborhood,
    bairro: c.bairro,
    city: c.city,
    cidade: c.cidade,
    state: c.state,
    uf: c.uf,
    state_uf: c.state_uf,
  }).fullInline;
}

export function formatAraguaiaSeatAddressFromCompany(
  company?: Record<string, unknown> | null,
): string {
  return formatAraguaiaSeatAddressParts(company).fullInline;
}
