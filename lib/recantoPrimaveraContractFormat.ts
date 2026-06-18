/**
 * Formatação e sanitização exclusiva do contrato Recanto Primavera.
 */

import { formatCep, formatCpfCnpj, onlyDigits } from '@/lib/inputMasks';
import { sanitizeContractField } from '@/lib/recantoPrimaveraCompanyProfile';

export function formatRecantoDocument(value: unknown): string {
  const raw = sanitizeContractField(value);
  if (!raw) return '';
  return formatCpfCnpj(raw) || raw;
}

export function formatRecantoPhone(value: unknown): string {
  const raw = sanitizeContractField(value);
  if (!raw) return '';
  const digits = onlyDigits(raw);
  if (digits.length === 11) {
    return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }
  if (digits.length === 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }
  return raw;
}

export function formatRecantoCep(value: unknown): string {
  const raw = sanitizeContractField(value);
  if (!raw) return '';
  return formatCep(raw) || raw;
}

function normalizeAddressToken(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Remove partes repetidas ou contidas em outra (ex.: cidade duplicada, bairro repetido). */
export function dedupeAddressParts(parts: string[]): string[] {
  const result: string[] = [];
  const seen: string[] = [];

  for (const part of parts) {
    const clean = sanitizeContractField(part);
    if (!clean) continue;
    const norm = normalizeAddressToken(clean);
    if (!norm) continue;

    let duplicate = false;
    for (const existing of seen) {
      if (
        existing === norm ||
        existing.includes(norm) ||
        norm.includes(existing)
      ) {
        duplicate = true;
        break;
      }
    }
    if (duplicate) continue;

    seen.push(norm);
    result.push(clean);
  }

  return result;
}

export function buildRecantoFullAddress(params: {
  street?: unknown;
  neighborhood?: unknown;
  cep?: unknown;
  city?: unknown;
  uf?: unknown;
  toTitleCase?: (s: string) => string;
}): string {
  const title =
    params.toTitleCase ??
    ((s: string) =>
      s
        .toLowerCase()
        .replace(/(?:^|\s)\S/g, (a) => a.toUpperCase())
        .replace(/\bS\/n\b/g, 'S/N'));

  const street = title(sanitizeContractField(params.street));
  const neighborhood = title(sanitizeContractField(params.neighborhood));
  const cep = formatRecantoCep(params.cep);
  const city = title(sanitizeContractField(params.city));
  const uf = sanitizeContractField(params.uf).toUpperCase();

  const parts: string[] = [];
  if (street) parts.push(street);

  if (neighborhood) {
    const bairroLabel = `Bairro ${neighborhood}`;
    const streetNorm = normalizeAddressToken(street);
    const bairroNorm = normalizeAddressToken(neighborhood);
    if (
      !streetNorm.includes(bairroNorm) &&
      !streetNorm.includes('bairro')
    ) {
      parts.push(bairroLabel);
    }
  }

  if (cep) parts.push(`CEP ${cep}`);

  if (city && uf) {
    parts.push(`${city} - ${uf}`);
  } else if (city) {
    parts.push(city);
  }

  return dedupeAddressParts(parts).join(', ');
}

export function resolveRecantoSignatureCity(params: {
  project?: Record<string, unknown> | null;
  companyCity?: string;
  companyUf?: string;
}): { city: string; uf: string } {
  const project =
    params.project && typeof params.project === 'object' ? params.project : {};

  const cityRaw =
    sanitizeContractField(project.forum_city) ||
    sanitizeContractField(project.city) ||
    sanitizeContractField(params.companyCity);

  const ufRaw =
    sanitizeContractField(project.uf || project.state) ||
    sanitizeContractField(params.companyUf);

  const toTitle = (s: string) =>
    s
      .toLowerCase()
      .replace(/(?:^|\s)\S/g, (a) => a.toUpperCase());

  return {
    city: cityRaw ? toTitle(cityRaw) : '',
    uf: ufRaw ? ufRaw.toUpperCase() : '',
  };
}
