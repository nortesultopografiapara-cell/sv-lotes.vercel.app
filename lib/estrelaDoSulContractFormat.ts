const extenso = require('extenso');

export function escEstrelaHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function estrelaStrong(value: string): string {
  const clean = String(value || '').trim();
  if (!clean) return '';
  return `<strong>${escEstrelaHtml(clean)}</strong>`;
}

export function formatEstrelaBRL(val: number): string {
  if (!Number.isFinite(val) || val < 0) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(val);
}

export function formatEstrelaExtensoCurrency(val: number): string {
  if (!Number.isFinite(val) || val <= 0) return '';
  try {
    return String(
      extenso(val.toFixed(2).replace('.', ','), { mode: 'currency' }),
    );
  } catch {
    return '';
  }
}

export function formatEstrelaMoneyPhrase(val: number): string {
  const fmt = formatEstrelaBRL(val);
  const words = formatEstrelaExtensoCurrency(val);
  if (words) return `${fmt} (${words})`;
  return fmt;
}

export function formatEstrelaNumber(val: number, digits = 2): string {
  if (!Number.isFinite(val)) return '';
  return val.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function extensoInteger(val: number): string {
  if (!Number.isFinite(val) || val < 0) return '';
  try {
    return String(extenso(Math.round(val), { mode: 'number' }));
  } catch {
    return '';
  }
}

function extensoCardinal(val: number): string {
  if (!Number.isFinite(val) || val < 0) return '';
  try {
    return String(extenso(String(val), { mode: 'number' }));
  } catch {
    return '';
  }
}

/**
 * Medida linear por extenso a partir do decimal GIS exato (2 casas).
 * Não arredonda metros: 10,05 → "dez metros e cinco centímetros".
 */
export function formatEstrelaMetersExtenso(
  meters: number | string | null | undefined,
): string {
  const num = Number(meters);
  if (!Number.isFinite(num) || num <= 0) return '';
  const [metersRaw, cmRaw] = num.toFixed(2).split('.');
  const whole = Number(metersRaw);
  const cm = Number(cmRaw);
  if (!Number.isFinite(whole) || !Number.isFinite(cm)) return '';

  const metersWords = extensoCardinal(whole);
  const cmWords = extensoCardinal(cm);
  if (!metersWords) return '';

  if (cm === 0) {
    return whole === 1 ? `${metersWords} metro` : `${metersWords} metros`;
  }
  if (!cmWords) return whole === 1 ? `${metersWords} metro` : `${metersWords} metros`;
  const mUnit = whole === 1 ? 'metro' : 'metros';
  const cUnit = cm === 1 ? 'centímetro' : 'centímetros';
  if (whole === 0) {
    return `${cmWords} ${cUnit}`;
  }
  return `${metersWords} ${mUnit} e ${cmWords} ${cUnit}`;
}

export function formatEstrelaMetersPhrase(meters: number | string | null | undefined): string {
  const num = Number(meters);
  if (!Number.isFinite(num) || num <= 0) return '';
  const fmt = `${formatEstrelaNumber(num)}m`;
  const words = formatEstrelaMetersExtenso(num);
  if (words) return `${fmt} (${words})`;
  return fmt;
}

export function formatEstrelaAreaPhrase(areaM2: number | string | null | undefined): string {
  const num = Number(areaM2);
  if (!Number.isFinite(num) || num <= 0) return '';
  const fmt = `${formatEstrelaNumber(num)}m²`;
  const words = extensoInteger(num);
  if (words) return `${fmt} (${words} metros quadrados)`;
  return fmt;
}

export function formatEstrelaUpperDate(longDate: string): string {
  const raw = String(longDate || '').trim();
  if (!raw) return '';
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\bDE\b/g, 'DE');
}

const EMPTY_LOCATION_TOKENS = new Set([
  '',
  'undefined',
  'null',
  'nan',
  'n/a',
  'na',
  '-',
  '—',
]);

function cleanEstrelaLocationPart(value: unknown): string {
  if (value == null) return '';
  const text = String(value).trim().replace(/\s+/g, ' ');
  if (!text || EMPTY_LOCATION_TOKENS.has(text.toLowerCase())) return '';
  return text;
}

function pickEstrelaLocationPart(...values: unknown[]): string {
  for (const value of values) {
    const clean = cleanEstrelaLocationPart(value);
    if (clean) return clean;
  }
  return '';
}

/**
 * Localização física do empreendimento a partir do cadastro do projeto.
 * Não usa foro nem endereço da empresa. Sem hardcode de empreendimento.
 * Formato: [Endereço/Referência], [Bairro/Localidade], [Cidade]/[UF]
 */
export function formatEstrelaEnterpriseLocation(
  project: Record<string, unknown> | null | undefined,
): string {
  const rec = project && typeof project === 'object' ? project : {};
  const address = pickEstrelaLocationPart(
    rec.address,
    rec.address_reference,
    rec.reference,
    rec.endereco,
  );
  const neighborhood = pickEstrelaLocationPart(
    rec.neighborhood,
    rec.locality,
    rec.bairro,
  );
  const city = pickEstrelaLocationPart(rec.city, rec.cidade);
  const uf = pickEstrelaLocationPart(rec.uf, rec.state).toUpperCase();
  const cityUf = [city, uf].filter(Boolean).join('/');
  return [address, neighborhood, cityUf]
    .filter(Boolean)
    .join(', ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*,+/g, ',')
    .replace(/^,\s*|\s*,$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
