/**
 * Normalização — atualização de parcelas importadas.
 */

import { parseSaleImportCurrency, parseSaleImportDate } from '@/lib/imports/modules/sales/normalize';
import { normalizeImportEntityName } from '@/lib/imports/modules/sales/normalize';

export function parseInstallmentNumber(raw: string): {
  value: number | null;
  error?: string;
} {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { value: null, error: 'Número da parcela é obrigatório.' };

  const lower = trimmed.toLowerCase();
  if (lower === 'entrada' || lower === 'entry') return { value: 0 };
  if (lower === 'sinal' || lower === 'signal') return { value: -1 };

  const digits = trimmed.replace(/[^\d-]/g, '');
  if (!digits) return { value: null, error: 'Número da parcela inválido.' };

  const parsed = Number(digits);
  if (!Number.isFinite(parsed)) {
    return { value: null, error: 'Número da parcela inválido.' };
  }

  return { value: parsed };
}

export function parseInstallmentStatus(raw: string): {
  value: string | null;
  error?: string;
} {
  const normalized = String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (!normalized) return { value: null };

  if (['pago', 'paid', 'quitado', 'quitada'].includes(normalized)) {
    return { value: 'pago' };
  }
  if (['pendente', 'pending', 'aberto', 'aberta'].includes(normalized)) {
    return { value: 'pendente' };
  }
  if (['atrasado', 'atrasada', 'overdue', 'vencido', 'vencida'].includes(normalized)) {
    return { value: 'atrasado' };
  }
  if (['cancelado', 'cancelada', 'cancelled', 'canceled'].includes(normalized)) {
    return { value: 'cancelado' };
  }

  return { value: null, error: `Status "${raw}" não reconhecido.` };
}

export function normalizeInstallmentCustomerName(value?: string | null): string {
  return normalizeImportEntityName(value);
}

export { parseSaleImportCurrency, parseSaleImportDate };
