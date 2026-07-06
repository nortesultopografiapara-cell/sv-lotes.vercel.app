/**
 * Mapeamento de colunas — atualização de parcelas.
 */

import {
  INSTALLMENTS_IMPORT_FIELD_ALIASES,
  INSTALLMENTS_IMPORT_REQUIRED_FIELDS,
} from '@/lib/imports/modules/installments/constants';
import type {
  InstallmentColumnMapping,
  InstallmentColumnMappingResult,
  InstallmentImportField,
} from '@/lib/imports/modules/installments/types';
import { normalizeImportHeader } from '@/lib/imports/modules/customers/columnMapping';

export function mapInstallmentImportColumns(headers: string[]): InstallmentColumnMappingResult {
  const normalizedHeaders = headers.map((header, index) => ({
    original: header,
    normalized: normalizeImportHeader(header),
    index,
  }));

  const mapping: InstallmentColumnMapping = {};
  const recognizedHeaders: InstallmentColumnMappingResult['recognizedHeaders'] = {};
  const usedHeaderIndexes = new Set<number>();
  const fields = Object.keys(INSTALLMENTS_IMPORT_FIELD_ALIASES) as InstallmentImportField[];

  for (const field of fields) {
    const aliases = INSTALLMENTS_IMPORT_FIELD_ALIASES[field].map(normalizeImportHeader);
    const match = normalizedHeaders.find(
      (header) =>
        !usedHeaderIndexes.has(header.index) &&
        aliases.some(
          (alias) =>
            header.normalized === alias ||
            header.normalized.replace(/_/g, ' ') === alias.replace(/_/g, ' '),
        ),
    );

    if (match) {
      mapping[field] = match.original;
      recognizedHeaders[field] = match.original;
      usedHeaderIndexes.add(match.index);
    } else {
      recognizedHeaders[field] = undefined;
    }
  }

  const unmappedHeaders = normalizedHeaders
    .filter((header) => !usedHeaderIndexes.has(header.index))
    .map((header) => header.original);

  const missingRequired = INSTALLMENTS_IMPORT_REQUIRED_FIELDS.filter((field) => !mapping[field]);

  return {
    mapping,
    unmappedHeaders,
    missingRequired,
    recognizedHeaders,
  };
}

export function getInstallmentColumnMappingErrorMessage(
  result: InstallmentColumnMappingResult,
): string | null {
  if (result.missingRequired.length === 0) return null;

  const missing = result.missingRequired.join(', ');
  return `Não foi possível reconhecer a(s) coluna(s) obrigatória(s): ${missing}. Verifique o cabeçalho da planilha ou baixe o modelo oficial.`;
}

export function pickMappedInstallmentCell(
  row: Record<string, string>,
  mapping: InstallmentColumnMapping,
  field: InstallmentImportField,
): string {
  const header = mapping[field];
  if (!header) return '';
  return String(row[header] ?? '').trim();
}
