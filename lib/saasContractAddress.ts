/**
 * Endereços padronizados para contrato SaaS, certificado e PDF.
 */

import {
  formatContractCep,
  formatContractCepRegional,
  formatContractCity,
} from '@/lib/saasContractFormat';

export type SaasContractAddressParts = {
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  block?: string | null;
  lot?: string | null;
  city?: string | null;
  state?: string | null;
  cep?: string | null;
};

function pick(...values: unknown[]): string {
  for (const value of values) {
    const s = String(value ?? '').trim();
    if (s) return s;
  }
  return '';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Remove bairro colado ao final do logradouro quando já existe campo bairro. */
export function stripAddressNeighborhood(street: string, neighborhood: string): string {
  const s = String(street ?? '').trim();
  const n = String(neighborhood ?? '').trim();
  if (!s || !n) return s;

  let out = s.replace(new RegExp(`,?\\s*Bairro\\s+${escapeRegExp(n)}\\s*$`, 'i'), '');
  out = out.replace(new RegExp(`,?\\s*${escapeRegExp(n)}\\s*$`, 'i'), '');
  return out.replace(/,\s*$/, '').trim();
}

/** Separa complemento S/N do fim da linha de logradouro. */
export function splitAddressComplement(street: string): { street: string; complement: string } {
  const s = String(street ?? '').trim();
  const match = s.match(/^(.*?)(?:,\s*)?(S\s*\/?\s*N\.?)\s*$/i);
  if (!match) return { street: s, complement: '' };
  return {
    street: match[1].replace(/,\s*$/, '').trim(),
    complement: 'S/N',
  };
}

/** Insere separadores quando logradouro/quadra/lote vêm colados (ex.: "Rua 02quadra 123"). */
export function normalizeContractStreetLine(raw?: string | null): string {
  let s = String(raw ?? '').trim();
  if (!s) return s;

  s = s.replace(/\b(Quadra\s+\d+)\s+(Lote\s+\d+)/gi, '$1, $2');
  s = s.replace(/(\d)(?=(quadra|q\.?\s?\d|lote|lt\.?\s?\d))/gi, '$1, ');
  s = s.replace(/(quadra|q\.?\s?\d*)\s*(?=lote|lt\.?\s?\d)/gi, '$1, ');
  s = s.replace(/\bquadra\b/gi, 'Quadra');
  s = s.replace(/\bq\.?\s?(\d+)/gi, 'Quadra $1');
  s = s.replace(/\blote\b/gi, 'Lote');
  s = s.replace(/\blt\.?\s?(\d+)/gi, 'Lote $1');
  s = s.replace(/\s*,\s*/g, ', ');
  s = s.replace(/\s+/g, ' ');
  return s.trim();
}

function addressContainsToken(address: string, token: string): boolean {
  if (!address || !token) return false;
  const norm = address.toLowerCase();
  const digits = token.replace(/\D/g, '');
  if (/^quadra/i.test(token) && digits) {
    return norm.includes(`quadra ${digits}`) || norm.includes(`quadra${digits}`);
  }
  if (/^lote/i.test(token) && digits) {
    return norm.includes(`lote ${digits}`) || norm.includes(`lote${digits}`);
  }
  return norm.includes(token.toLowerCase());
}

export function buildContractStreetLine(parts: SaasContractAddressParts): string {
  const streetBase = normalizeContractStreetLine(parts.street);
  const { street: streetWithoutSn, complement: snComplement } = splitAddressComplement(streetBase);
  const number = pick(parts.number);
  const complement = pick(parts.complement) || snComplement;
  const blockRaw = pick(parts.block);
  const lotRaw = pick(parts.lot);

  const segments: string[] = [];
  if (streetWithoutSn && number) {
    segments.push(`${streetWithoutSn}, ${number}`);
  } else if (streetWithoutSn) {
    segments.push(streetWithoutSn);
  } else if (number) {
    segments.push(number);
  }

  if (complement) segments.push(complement);

  if (blockRaw && !addressContainsToken(streetWithoutSn, blockRaw)) {
    const blockNorm = /^quadra/i.test(blockRaw)
      ? normalizeContractStreetLine(blockRaw)
      : `Quadra ${blockRaw.replace(/\D/g, '') || blockRaw}`;
    segments.push(blockNorm);
  }

  if (lotRaw && !addressContainsToken(streetWithoutSn, lotRaw)) {
    const lotNorm = /^lote/i.test(lotRaw)
      ? normalizeContractStreetLine(lotRaw)
      : `Lote ${lotRaw.replace(/\D/g, '') || lotRaw}`;
    segments.push(lotNorm);
  }

  return segments.join(', ');
}

export function buildContractCityStateLine(city?: string | null, state?: string | null): string {
  const c = pick(city);
  const uf = pick(state).toUpperCase();
  if (!c && !uf) return 'Não informado';
  if (!c) return uf;
  if (!uf) return formatContractCity(c);
  return formatContractCity(`${c}/${uf}`);
}

export type SaasContractFormattedAddress = {
  streetLine: string;
  neighborhood: string;
  cityStateLine: string;
  cepLine: string;
  multiline: string;
  qualificationInline: string;
};

export function formatSaasContractAddress(
  parts: SaasContractAddressParts,
  options?: { cepRegional?: boolean },
): SaasContractFormattedAddress {
  const neighborhood = pick(parts.neighborhood) || '';
  const streetSource = stripAddressNeighborhood(pick(parts.street), neighborhood);
  const streetLine = buildContractStreetLine({ ...parts, street: streetSource }) || 'Não informado';
  const cityStateLine = buildContractCityStateLine(parts.city, parts.state);
  const cepRaw = pick(parts.cep);
  const cepFormatted = cepRaw
    ? options?.cepRegional
      ? formatContractCepRegional(cepRaw)
      : formatContractCep(cepRaw)
    : '';
  const cepLine = cepFormatted ? `CEP ${cepFormatted}` : '';

  const lines = [streetLine];
  if (neighborhood) lines.push(`Bairro ${neighborhood}`);
  lines.push(cityStateLine);
  if (cepLine) lines.push(cepLine);

  const cepPart = cepLine ? `, ${cepLine}` : '';
  const neighborhoodPart = neighborhood ? `, Bairro ${neighborhood}` : '';

  return {
    streetLine,
    neighborhood,
    cityStateLine,
    cepLine,
    multiline: lines.join('\n'),
    qualificationInline: `${streetLine}${neighborhoodPart}, ${cityStateLine}${cepPart}`,
  };
}

export function extractAddressPartsFromCompany(
  company: Record<string, unknown>,
): SaasContractAddressParts {
  const neighborhood = pick(company.bairro, company.neighborhood);
  const rawAddress = pick(company.address, company.endereco);
  const parsedStreet = rawAddress
    ? stripAddressNeighborhood(normalizeContractStreetLine(rawAddress), neighborhood)
    : buildContractStreetLine({
        street: pick(company.logradouro, company.address, company.endereco),
        number: pick(company.numero, company.number),
        complement: pick(company.complemento, company.complement),
        block: pick(company.quadra, company.block),
        lot: pick(company.lote, company.lot),
      });

  const block = pick(company.quadra, company.block);
  const lot = pick(company.lote, company.lot);
  const useSeparateBlockLot =
    Boolean(block || lot) &&
    !addressContainsToken(parsedStreet, block) &&
    !addressContainsToken(parsedStreet, lot);

  return {
    street: parsedStreet,
    neighborhood,
    block: useSeparateBlockLot ? block : '',
    lot: useSeparateBlockLot ? lot : '',
    city: pick(company.city, company.cidade),
    state: pick(company.state, company.uf, company.state_uf),
    cep: pick(company.cep, company.zip_code),
  };
}
