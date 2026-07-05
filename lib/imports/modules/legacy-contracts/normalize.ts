/**
 * Normalização — importação de contratos antigos.
 */

import {
  LEGACY_CONTRACT_STATUS_VALUES,
  type LegacyContractStatusValue,
} from '@/lib/imports/modules/legacy-contracts/constants';
import {
  normalizeImportEmail,
  normalizeImportEntityName,
  normalizeImportLoteNumber,
  normalizeImportQuadra,
  parseSaleImportDate,
} from '@/lib/imports/modules/sales/normalize';

export function normalizeLegacyContractPdfFileName(value?: string | null): string {
  const raw = String(value || '')
    .trim()
    .replace(/\\/g, '/');
  const base = raw.split('/').pop() || '';
  return base.toLowerCase();
}

export function parseLegacyContractStatus(raw: string): {
  value: LegacyContractStatusValue;
  normalized: string;
  error?: string;
} {
  const normalized = String(raw || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (!normalized) {
    return { value: 'ANTIGO', normalized: 'ANTIGO' };
  }

  if ((LEGACY_CONTRACT_STATUS_VALUES as readonly string[]).includes(normalized)) {
    return { value: normalized as LegacyContractStatusValue, normalized };
  }

  return {
    value: 'ANTIGO',
    normalized,
    error: `Status não reconhecido ("${raw}") — use ASSINADO, PENDENTE, CANCELADO, QUITADO ou ANTIGO.`,
  };
}

export function parseLegacyContractDate(raw: unknown): {
  value: string | null;
  error?: string;
} {
  return parseSaleImportDate(raw);
}

export {
  normalizeImportEmail,
  normalizeImportEntityName,
  normalizeImportLoteNumber,
  normalizeImportQuadra,
};

export function buildLegacyContractSaleKey(customerId: string, blockId: string): string {
  return `${customerId}::${blockId}`;
}

export function sanitizeLegacyContractStorageFileName(fileName: string): string {
  const base = normalizeLegacyContractPdfFileName(fileName);
  const safe = base.replace(/[^\w.-]+/g, '_');
  return safe.endsWith('.pdf') ? safe : `${safe}.pdf`;
}

export function buildLegacyContractStoragePath(
  tenantId: string,
  saleId: string,
  fileName: string,
): string {
  return `${tenantId}/${saleId}/${sanitizeLegacyContractStorageFileName(fileName)}`;
}
