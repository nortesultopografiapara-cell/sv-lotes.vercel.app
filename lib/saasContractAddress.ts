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

/** Insere separadores quando logradouro/quadra/lote vêm colados (ex.: "Rua 02quadra 123"). */
export function normalizeContractStreetLine(raw?: string | null): string {
  let s = String(raw ?? '').trim();
  if (!s) return s;

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

export function buildContractStreetLine(parts: SaasContractAddressParts): string {
  const street = normalizeContractStreetLine(parts.street);
  const number = pick(parts.number);
  const complement = pick(parts.complement);
  const block = pick(parts.block);
  const lot = pick(parts.lot);

  const segments: string[] = [];
  if (street && number) {
    segments.push(`${street}, ${number}`);
  } else if (street) {
    segments.push(street);
  } else if (number) {
    segments.push(number);
  }

  if (complement) segments.push(complement);
  if (block) {
    const blockNorm = /^quadra/i.test(block) ? block : `Quadra ${block.replace(/\D/g, '') || block}`;
    segments.push(blockNorm);
  }
  if (lot) {
    const lotNorm = /^lote/i.test(lot) ? lot : `Lote ${lot.replace(/\D/g, '') || lot}`;
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
  /** Bloco multilinha para certificado */
  multiline: string;
  /** Linha única para cláusula de qualificação */
  qualificationInline: string;
};

export function formatSaasContractAddress(
  parts: SaasContractAddressParts,
  options?: { cepRegional?: boolean },
): SaasContractFormattedAddress {
  const streetLine = buildContractStreetLine(parts) || 'Não informado';
  const neighborhood = pick(parts.neighborhood) || '';
  const cityStateLine = buildContractCityStateLine(parts.city, parts.state);
  const cepRaw = pick(parts.cep);
  const cepFormatted = cepRaw
    ? options?.cepRegional
      ? formatContractCepRegional(cepRaw)
      : formatContractCep(cepRaw)
    : '';
  const cepLine = cepFormatted ? `CEP ${cepFormatted}` : '';

  const lines = [streetLine];
  if (neighborhood) lines.push(neighborhood);
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
  const normalizedStreet =
    pick(company.address, company.endereco) ||
    buildContractStreetLine({
      street: pick(company.logradouro, company.address, company.endereco),
      number: pick(company.numero, company.number),
      complement: pick(company.complemento, company.complement),
      block: pick(company.quadra, company.block),
      lot: pick(company.lote, company.lot),
    });

  return {
    street: normalizedStreet,
    neighborhood: pick(company.bairro, company.neighborhood),
    block: pick(company.quadra, company.block),
    lot: pick(company.lote, company.lot),
    city: pick(company.city, company.cidade),
    state: pick(company.state, company.uf, company.state_uf),
    cep: pick(company.cep, company.zip_code),
  };
}
