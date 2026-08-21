/**
 * Normalização de campos — importação de vendas.
 */

import { parseCurrencyBRL } from '@/lib/currencyBrl';
import { parseBrokerCommissionPercent } from '@/lib/imports/modules/brokers/normalize';
import {
  cleanSpreadsheetString,
  excelSerialToIsoDate,
  extractRichCellValue,
  formatDateObjectAsIso,
  isLikelyExcelDateSerial,
} from '@/lib/imports/spreadsheetCellValue';
import { INSTALLMENTS_MAX } from '@/lib/installmentsCount';
import { normalizeLotNumberForMatch } from '@/lib/shapefileImport';

export function normalizeImportEntityName(value?: string | null): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function normalizeImportEmail(value?: string | null): string {
  return String(value || '').trim().toUpperCase();
}

export function normalizeImportQuadra(value?: string | null): string {
  return normalizeImportEntityName(value);
}

export function normalizeImportLoteNumber(value?: string | null): string {
  return normalizeLotNumberForMatch(value) || normalizeImportEntityName(value);
}

export function parseSaleImportCurrency(raw: unknown): {
  value: number | null;
  error?: string;
} {
  const extracted = extractRichCellValue(raw);
  if (extracted == null || extracted === '') return { value: null };

  if (typeof extracted === 'number') {
    if (!Number.isFinite(extracted) || extracted < 0) {
      return { value: null, error: 'Valor monetário inválido.' };
    }
    if (extracted === 0) return { value: null };
    return { value: Math.round(extracted * 100) / 100 };
  }

  const trimmed = cleanSpreadsheetString(String(extracted));
  if (!trimmed) return { value: null };

  const parsed = parseSaleImportCurrencyString(trimmed);
  if (parsed == null) {
    return { value: null, error: 'Valor monetário inválido.' };
  }
  return { value: parsed };
}

function normalizeSaleImportMoneyNumber(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  if (value === 0) return null;
  return Math.round(value * 100) / 100;
}

function parseSaleImportCurrencyString(raw: string): number | null {
  let cleaned = raw.replace(/[R$\s\u00a0]/gi, '').trim();
  if (!cleaned) return null;

  // Formato US do Excel: 90,000.00 ou 90,000
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(cleaned)) {
    return normalizeSaleImportMoneyNumber(Number(cleaned.replace(/,/g, '')));
  }

  // Formato brasileiro: 90.000,00
  if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(cleaned)) {
    return normalizeSaleImportMoneyNumber(
      Number(cleaned.replace(/\./g, '').replace(',', '.')),
    );
  }

  // Milhar brasileiro sem centavos: 90.000
  if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    return normalizeSaleImportMoneyNumber(Number(cleaned.replace(/\./g, '')));
  }

  // Decimal brasileiro: 90000,00
  if (/^\d+,\d{1,2}$/.test(cleaned)) {
    return normalizeSaleImportMoneyNumber(Number(cleaned.replace(',', '.')));
  }

  // Inteiro ou decimal com ponto: 90000 ou 90000.00
  if (/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return normalizeSaleImportMoneyNumber(Number(cleaned));
  }

  const fallback = parseCurrencyBRL(cleaned);
  return fallback == null ? null : normalizeSaleImportMoneyNumber(fallback);
}

function expandTwoDigitYear(year: number): number {
  if (year >= 100) return year;
  return year >= 0 && year <= 99 ? 2000 + year : year;
}

function validateIsoDateParts(year: number, month: number, day: number): {
  value: string | null;
  error?: string;
} {
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return { value: null, error: 'Data de venda inválida.' };
  }
  return {
    value: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

function tryBuildDate(yearRaw: string, monthRaw: string, dayRaw: string): {
  value: string | null;
  error?: string;
} {
  const year = expandTwoDigitYear(Number(yearRaw));
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return { value: null, error: 'Data de venda inválida.' };
  }
  return validateIsoDateParts(year, month, day);
}

function hasLeadingZero(part: string): boolean {
  return part.length >= 2 && part.startsWith('0');
}

function parseSlashDelimitedDate(trimmed: string): {
  value: string | null;
  error?: string;
} | null {
  const match = trimmed.match(/^(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{2}|\d{4})(?:[\sT].*)?$/);
  if (!match) return null;

  const [, part1, part2, yearRaw] = match;
  const n1 = Number(part1);
  const n2 = Number(part2);

  const attempts: Array<{ day: string; month: string }> = [];

  const brStyle = hasLeadingZero(part1) || hasLeadingZero(part2);
  if (brStyle || n1 > 12 || n2 > 12) {
    attempts.push({ day: part1, month: part2 });
  }

  if (!brStyle && n1 <= 12 && n2 <= 12) {
    // Exportação US do Excel (M/D/YY) — ex.: 6/5/26 → 2026-06-05
    attempts.push({ day: part2, month: part1 });
  }

  if (n1 > 12 && n2 <= 12) {
    attempts.push({ day: part1, month: part2 });
  } else if (n2 > 12 && n1 <= 12) {
    attempts.push({ day: part2, month: part1 });
  }

  if (attempts.length === 0) {
    attempts.push({ day: part1, month: part2 });
  }

  const seen = new Set<string>();
  for (const attempt of attempts) {
    const key = `${attempt.day}/${attempt.month}/${yearRaw}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const parsed = tryBuildDate(yearRaw, attempt.month, attempt.day);
    if (parsed.value) return parsed;
  }

  return { value: null, error: 'Data de venda inválida.' };
}

function parseIsoLikeDate(trimmed: string): {
  value: string | null;
  error?: string;
} | null {
  const dashMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (dashMatch) {
    return tryBuildDate(dashMatch[1], dashMatch[2], dashMatch[3]);
  }

  const slashIsoMatch = trimmed.match(/^(\d{4})\/(\d{2})\/(\d{2})(?:[\sT].*)?$/);
  if (slashIsoMatch) {
    return tryBuildDate(slashIsoMatch[1], slashIsoMatch[2], slashIsoMatch[3]);
  }

  return null;
}

function normalizeDateInput(raw: unknown): string {
  const extracted = extractRichCellValue(raw);
  if (extracted == null || extracted === '') return '';

  if (extracted instanceof Date) {
    return formatDateObjectAsIso(extracted);
  }

  if (typeof extracted === 'number' && isLikelyExcelDateSerial(extracted)) {
    return excelSerialToIsoDate(extracted);
  }

  return cleanSpreadsheetString(String(extracted));
}

export function parseSaleImportDate(raw: unknown): {
  value: string | null;
  error?: string;
} {
  const normalized = normalizeDateInput(raw);
  if (!normalized) return { value: null };

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return { value: normalized };
  }

  const isoParsed = parseIsoLikeDate(normalized);
  if (isoParsed?.value) return isoParsed;

  const slashParsed = parseSlashDelimitedDate(normalized);
  if (slashParsed?.value) return slashParsed;
  if (slashParsed?.error && !slashParsed.value) {
    return slashParsed;
  }

  return { value: null, error: 'Data de venda inválida. Use dd/mm/aaaa.' };
}

export function parseSaleImportStatus(raw: string): {
  value: 'Vendido' | 'Reservado';
  normalized: string;
  error?: string;
} {
  const normalized = String(raw || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (!normalized) {
    return { value: 'Vendido', normalized: 'VENDIDO' };
  }

  if (['VENDIDO', 'VENDIDA', 'SALE', 'SOLD'].includes(normalized)) {
    return { value: 'Vendido', normalized };
  }

  if (['RESERVADO', 'RESERVADA', 'RESERVED'].includes(normalized)) {
    return { value: 'Reservado', normalized };
  }

  return {
    value: 'Vendido',
    normalized,
    error: `Status não reconhecido ("${raw}") — use VENDIDO ou RESERVADO.`,
  };
}

export function parseSaleInstallmentsCount(raw: string): number {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return 1;
  const num = Number(trimmed.replace(/\D/g, ''));
  if (!Number.isFinite(num) || num < 1) return 1;
  return Math.min(INSTALLMENTS_MAX, Math.floor(num));
}

export function parseSaleCommissionPercent(raw: string): number | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  const parsed = parseBrokerCommissionPercent(trimmed);
  return parsed.error ? null : parsed.value;
}

export function resolveSaleBalance(
  valorTotal: number,
  entrada: number,
  sinal: number,
  saldoRaw: number | null,
): number {
  if (saldoRaw != null && saldoRaw >= 0) return saldoRaw;
  return Math.max(0, Math.round((valorTotal - entrada - sinal) * 100) / 100);
}

export function isBlockOccupiedStatus(status?: string | null): boolean {
  const normalized = String(status || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return ['vendido', 'vendida', 'sold', 'reservado', 'reservada', 'reserved'].includes(
    normalized,
  );
}

export function buildBlockLookupKey(
  projectId: string,
  quadra: string,
  lote: string,
): string {
  return `${projectId}::${normalizeImportQuadra(quadra)}::${normalizeImportLoteNumber(lote)}`;
}

export function buildSpreadsheetBlockKey(
  empreendimentoNormalized: string,
  quadraNormalized: string,
  loteNormalized: string,
): string {
  return `${empreendimentoNormalized}::${quadraNormalized}::${loteNormalized}`;
}
