/**
 * Leitura de planilhas Excel/CSV para importação de clientes.
 */

import * as XLSX from 'xlsx';
import {
  mapCustomerImportColumns,
  pickMappedCell,
} from '@/lib/imports/modules/customers/columnMapping';
import type {
  CustomerColumnMappingResult,
  ParsedCustomerRow,
} from '@/lib/imports/modules/customers/types';
import { normalizeCep, normalizeCpfCnpj } from '@/lib/inputMasks';
import { normalizePhone } from '@/lib/customerIdentity';

export type ParsedSpreadsheet = {
  fileType: 'xlsx' | 'xls' | 'csv' | 'unknown';
  headers: string[];
  rawRows: Record<string, string>[];
  rowCount: number;
};

function detectFileType(fileName: string): ParsedSpreadsheet['fileType'] {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xlsx')) return 'xlsx';
  if (lower.endsWith('.xls')) return 'xls';
  if (lower.endsWith('.csv')) return 'csv';
  return 'unknown';
}

function sheetToMatrix(workbook: XLSX.WorkBook): string[][] {
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as string[][];
  return matrix.filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''));
}

function matrixToRecords(matrix: string[][]): { headers: string[]; rawRows: Record<string, string>[] } {
  if (!matrix.length) {
    return { headers: [], rawRows: [] };
  }

  const headers = matrix[0].map((cell, index) => {
    const value = String(cell ?? '').trim();
    return value || `coluna_${index + 1}`;
  });

  const rawRows = matrix.slice(1).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = String(row[index] ?? '').trim();
    });
    return record;
  });

  return { headers, rawRows };
}

export function parseImportSpreadsheetBuffer(
  buffer: Buffer | ArrayBuffer,
  fileName: string,
): ParsedSpreadsheet {
  const fileType = detectFileType(fileName);
  const data = buffer instanceof Buffer ? buffer : Buffer.from(buffer);

  const readOptions: XLSX.ParsingOptions = { type: 'buffer', cellDates: false };
  if (fileType === 'csv') {
    readOptions.raw = false;
  }

  const workbook = XLSX.read(data, readOptions);
  const matrix = sheetToMatrix(workbook);
  const { headers, rawRows } = matrixToRecords(matrix);

  return {
    fileType,
    headers,
    rawRows,
    rowCount: rawRows.length,
  };
}

function isExampleRow(nome: string): boolean {
  return nome.toUpperCase().includes('EXEMPLO');
}

export function mapRawRowsToCustomerRows(
  rawRows: Record<string, string>[],
  columnMapping: CustomerColumnMappingResult,
): ParsedCustomerRow[] {
  const rows: ParsedCustomerRow[] = [];

  rawRows.forEach((rawRow, index) => {
    const nome = pickMappedCell(rawRow, columnMapping.mapping, 'nome');
    const cpfRaw = pickMappedCell(rawRow, columnMapping.mapping, 'cpf_cnpj');
    const telefoneRaw = pickMappedCell(rawRow, columnMapping.mapping, 'telefone');
    const whatsappRaw = pickMappedCell(rawRow, columnMapping.mapping, 'whatsapp');

    const allEmpty = CUSTOMER_IMPORT_ROW_FIELDS.every(
      (field) => pickMappedCell(rawRow, columnMapping.mapping, field) === '',
    );
    if (allEmpty) return;

    if (isExampleRow(nome)) return;

    rows.push({
      lineNumber: index + 2,
      raw: rawRow,
      nome,
      cpf_cnpj: cpfRaw,
      cpf_cnpj_digits: normalizeCpfCnpj(cpfRaw),
      rg: pickMappedCell(rawRow, columnMapping.mapping, 'rg'),
      telefone: telefoneRaw,
      telefone_digits: normalizePhone(telefoneRaw),
      whatsapp: whatsappRaw,
      whatsapp_digits: normalizePhone(whatsappRaw),
      email: pickMappedCell(rawRow, columnMapping.mapping, 'email'),
      endereco: pickMappedCell(rawRow, columnMapping.mapping, 'endereco'),
      cidade: pickMappedCell(rawRow, columnMapping.mapping, 'cidade'),
      uf: pickMappedCell(rawRow, columnMapping.mapping, 'uf').toUpperCase(),
      cep: pickMappedCell(rawRow, columnMapping.mapping, 'cep'),
      cep_digits: normalizeCep(pickMappedCell(rawRow, columnMapping.mapping, 'cep')),
      estado_civil: pickMappedCell(rawRow, columnMapping.mapping, 'estado_civil'),
      profissao: pickMappedCell(rawRow, columnMapping.mapping, 'profissao'),
      observacoes: pickMappedCell(rawRow, columnMapping.mapping, 'observacoes'),
    });
  });

  return rows;
}

const CUSTOMER_IMPORT_ROW_FIELDS = [
  'nome',
  'cpf_cnpj',
  'rg',
  'telefone',
  'whatsapp',
  'email',
  'endereco',
  'cidade',
  'uf',
  'cep',
  'estado_civil',
  'profissao',
  'observacoes',
] as const;

export function parseCustomerImportFile(
  buffer: Buffer | ArrayBuffer,
  fileName: string,
): {
  parsed: ParsedSpreadsheet;
  columnMapping: CustomerColumnMappingResult;
  rows: ParsedCustomerRow[];
} {
  const parsed = parseImportSpreadsheetBuffer(buffer, fileName);
  const columnMapping = mapCustomerImportColumns(parsed.headers);
  const rows = columnMapping.missingRequired.length
    ? []
    : mapRawRowsToCustomerRows(parsed.rawRows, columnMapping);

  return { parsed, columnMapping, rows };
}
