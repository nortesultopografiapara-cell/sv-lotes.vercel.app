/**
 * Combina resultados parciais de validação (chunks / staging).
 */

import type { LegacyContractImportValidationResult } from '@/lib/imports/modules/legacy-contracts/types';

export function mergeLegacyContractValidationResults(
  results: LegacyContractImportValidationResult[],
  documentsFileName: string,
): LegacyContractImportValidationResult {
  if (results.length === 0) {
    throw new Error('Nenhum resultado de validação para combinar.');
  }

  if (results.length === 1) {
    return results[0]!;
  }

  const rows = results.flatMap((result) => result.rows);
  const summary = {
    totalRows: rows.length,
    validRows: rows.filter((row) => row.status === 'valid').length,
    warningRows: rows.filter((row) => row.status === 'warning').length,
    errorRows: rows.filter((row) => row.status === 'error').length,
    duplicateRows: rows.filter((row) => row.status === 'duplicate').length,
    existingRows: rows.filter((row) => row.status === 'existing').length,
    ignoredRows: rows.filter((row) => !row.importable).length,
    importableRows: rows.filter((row) => row.importable).length,
  };

  const first = results[0]!;

  return {
    fileName: documentsFileName,
    documentsFileName,
    fileType: first.fileType,
    rowCount: rows.length,
    pdfCount: results.reduce((total, result) => total + result.pdfCount, 0),
    columnMapping: first.columnMapping,
    summary,
    rows,
  };
}
