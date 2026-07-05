/**
 * Normalização de campos — importação de vendas.
 */

import { parseCurrencyBRL } from '@/lib/currencyBrl';
import { parseBrokerCommissionPercent } from '@/lib/imports/modules/brokers/normalize';
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

export function parseSaleImportCurrency(raw: string): {
  value: number | null;
  error?: string;
} {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { value: null };

  const parsed = parseCurrencyBRL(trimmed);
  if (parsed == null) {
    return { value: null, error: 'Valor monetário inválido.' };
  }
  return { value: parsed };
}

function normalizeDateInput(raw: unknown): string {
  if (raw == null) return '';
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return '';
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const d = String(raw.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(raw)
    .trim()
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ');
}

function validateIsoDateParts(year: string, month: string, day: string): {
  value: string | null;
  error?: string;
} {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() + 1 !== m ||
    date.getUTCDate() !== d
  ) {
    return { value: null, error: 'Data de venda inválida.' };
  }
  return { value: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}` };
}

function parseExcelSerialDate(trimmed: string): string | null {
  if (!/^-?\d+([.,]\d+)?$/.test(trimmed)) return null;

  const num = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(num) || num <= 0 || num > 600000) return null;

  // Evita confundir ano (ex.: 2026) com serial Excel.
  if (Number.isInteger(num) && num >= 1900 && num <= 2100) return null;

  const wholeDays = Math.floor(num);
  const ms = (wholeDays - 25569) * 86400000;
  const date = new Date(ms);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseSaleImportDate(raw: unknown): {
  value: string | null;
  error?: string;
} {
  const trimmed = normalizeDateInput(raw);
  if (!trimmed) return { value: null };

  const excelSerial = parseExcelSerialDate(trimmed);
  if (excelSerial) return { value: excelSerial };

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (isoMatch) {
    return validateIsoDateParts(isoMatch[1], isoMatch[2], isoMatch[3]);
  }

  const brMatch = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:[\sT].*)?$/);
  if (brMatch) {
    return validateIsoDateParts(brMatch[3], brMatch[2], brMatch[1]);
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
  return Math.min(160, Math.floor(num));
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
