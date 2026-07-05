/**
 * Mapeamento de colunas — contratos antigos.
 */

import {
  LEGACY_CONTRACTS_FIELD_ALIASES,
  LEGACY_CONTRACTS_IMPORT_REQUIRED_FIELDS,
} from '@/lib/imports/modules/legacy-contracts/constants';
import type {
  LegacyContractColumnMapping,
  LegacyContractColumnMappingResult,
  LegacyContractImportField,
} from '@/lib/imports/modules/legacy-contracts/types';
import { normalizeImportHeader } from '@/lib/imports/modules/customers/columnMapping';

export function mapLegacyContractImportColumns(
  headers: string[],
): LegacyContractColumnMappingResult {
  const normalizedHeaders = headers.map((header, index) => ({
    original: header,
    normalized: normalizeImportHeader(header),
    index,
  }));

  const mapping: LegacyContractColumnMapping = {};
  const recognizedHeaders: LegacyContractColumnMappingResult['recognizedHeaders'] = {};
  const usedHeaderIndexes = new Set<number>();
  const fields = Object.keys(LEGACY_CONTRACTS_FIELD_ALIASES) as LegacyContractImportField[];

  for (const field of fields) {
    const aliases = LEGACY_CONTRACTS_FIELD_ALIASES[field].map(normalizeImportHeader);
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

  const missingRequired = LEGACY_CONTRACTS_IMPORT_REQUIRED_FIELDS.filter(
    (field) => !mapping[field],
  );

  const unmappedHeaders = normalizedHeaders
    .filter((header) => !usedHeaderIndexes.has(header.index))
    .map((header) => header.original);

  return { mapping, unmappedHeaders, missingRequired, recognizedHeaders };
}

export function pickMappedLegacyContractCell(
  rawRow: Record<string, string>,
  mapping: LegacyContractColumnMapping,
  field: LegacyContractImportField,
): string {
  const header = mapping[field];
  if (!header) return '';
  return String(rawRow[header] ?? '').trim();
}

export function getLegacyContractColumnMappingErrorMessage(
  result: LegacyContractColumnMappingResult,
): string | null {
  if (result.missingRequired.length === 0) return null;
  const labels = result.missingRequired.join(', ');
  return `Colunas obrigatórias não encontradas na planilha: ${labels}.`;
}
