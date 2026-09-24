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

export function formatEstrelaMetersPhrase(meters: number | string | null | undefined): string {
  const num = Number(meters);
  if (!Number.isFinite(num) || num <= 0) return '';
  const fmt = `${formatEstrelaNumber(num)}m`;
  const words = extensoInteger(num);
  if (words) return `${fmt} (${words} metros)`;
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
