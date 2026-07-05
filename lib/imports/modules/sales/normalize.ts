/**
 * Normalização de campos — importação de vendas.
 */

import { parseCurrencyBRL } from '@/lib/currencyBrl';
import { parseBrokerCommissionPercent } from '@/lib/imports/modules/brokers/normalize';

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
  return String(value || '')
    .trim()
    .replace(/^0+/, '')
    .toUpperCase();
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

export function parseSaleImportDate(raw: string): {
  value: string | null;
  error?: string;
} {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { value: null };

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return { value: `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}` };
  }

  const brMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (brMatch) {
    const day = brMatch[1].padStart(2, '0');
    const month = brMatch[2].padStart(2, '0');
    const year = brMatch[3];
    const date = new Date(`${year}-${month}-${day}T12:00:00.000Z`);
    if (
      date.getUTCFullYear() !== Number(year) ||
      date.getUTCMonth() + 1 !== Number(month) ||
      date.getUTCDate() !== Number(day)
    ) {
      return { value: null, error: 'Data de venda inválida.' };
    }
    return { value: `${year}-${month}-${day}` };
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
