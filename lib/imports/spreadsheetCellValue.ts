/**
 * Extração de valores de células Excel/CSV — importações.
 * Prioriza Date/serial nativo e texto formatado (cell.w) antes de string genérica.
 */

import * as XLSX from 'xlsx';

const EXCEL_EPOCH_OFFSET = 25569;
const MIN_EXCEL_DATE_SERIAL = 30000;
const MAX_EXCEL_DATE_SERIAL = 600000;

export function cleanSpreadsheetString(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function isLikelyExcelDateSerial(value: number): boolean {
  if (!Number.isFinite(value) || value <= 0) return false;
  if (Number.isInteger(value) && value >= 1900 && value <= 2100) return false;
  const wholeDays = Math.floor(value);
  return wholeDays >= MIN_EXCEL_DATE_SERIAL && wholeDays <= MAX_EXCEL_DATE_SERIAL;
}

function isDateFormattedCell(cell: XLSX.CellObject): boolean {
  const format = String(cell.z || '').toLowerCase();
  if (!format) return false;
  return /[dmy]/i.test(format) && !/^(general|@)$/i.test(format);
}

export function excelSerialToIsoDate(serial: number): string {
  const wholeDays = Math.floor(serial);
  const date = new Date((wholeDays - EXCEL_EPOCH_OFFSET) * 86400000);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDateObjectAsIso(value: Date): string {
  if (Number.isNaN(value.getTime())) return '';
  // SheetJS (cellDates:true) usa componentes UTC do serial Excel.
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function extractRichCellValue(value: unknown): unknown {
  if (value == null) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value !== 'object') return String(value);

  const cell = value as Record<string, unknown>;
  if (cell.text != null && String(cell.text).trim()) return cell.text;
  if (cell.w != null && String(cell.w).trim()) return cell.w;
  if (cell.result != null) return extractRichCellValue(cell.result);
  if (cell.value != null) return extractRichCellValue(cell.value);
  if (cell.v != null) return extractRichCellValue(cell.v);
  return String(value);
}

export function resolveSpreadsheetCellValue(
  sheet: XLSX.WorkSheet | null | undefined,
  rowIndex: number,
  colIndex: number,
  rawMatrixVal: unknown,
): unknown {
  if (!sheet) return extractRichCellValue(rawMatrixVal);

  const addr = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
  const cell = sheet[addr];
  if (!cell) return extractRichCellValue(rawMatrixVal);

  if (cell.t === 'd' && cell.v instanceof Date) {
    return cell.v;
  }

  if (cell.t === 'n' && typeof cell.v === 'number') {
    if (isLikelyExcelDateSerial(cell.v) || isDateFormattedCell(cell)) {
      return cell.v;
    }
  }

  const formatted = cleanSpreadsheetString(String(cell.w || ''));
  if (formatted) return formatted;

  if (cell.v instanceof Date) return cell.v;
  if (typeof cell.v === 'number' && isLikelyExcelDateSerial(cell.v)) return cell.v;

  return extractRichCellValue(cell.v ?? rawMatrixVal);
}

export function spreadsheetCellToDisplayString(
  sheet: XLSX.WorkSheet | null | undefined,
  rowIndex: number,
  colIndex: number,
  resolvedValue: unknown,
): string {
  if (sheet) {
    const addr = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
    const cell = sheet[addr];
    const formatted = cleanSpreadsheetString(String(cell?.w || ''));
    if (formatted) return formatted;
  }

  return spreadsheetCellToImportString(resolvedValue);
}

export function spreadsheetCellToImportString(value: unknown): string {
  const extracted = extractRichCellValue(value);
  if (extracted == null || extracted === '') return '';

  if (extracted instanceof Date) {
    return formatDateObjectAsIso(extracted);
  }

  if (typeof extracted === 'number' && isLikelyExcelDateSerial(extracted)) {
    return excelSerialToIsoDate(extracted);
  }

  return cleanSpreadsheetString(String(extracted));
}
