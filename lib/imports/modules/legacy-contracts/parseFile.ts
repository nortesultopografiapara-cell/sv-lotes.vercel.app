/**
 * Leitura da planilha — contratos antigos.
 */

import {
  mapLegacyContractImportColumns,
  pickMappedLegacyContractCell,
} from '@/lib/imports/modules/legacy-contracts/columnMapping';
import { LEGACY_CONTRACTS_IMPORT_TEMPLATE_COLUMNS } from '@/lib/imports/modules/legacy-contracts/constants';
import {
  normalizeImportEmail,
  normalizeImportEntityName,
  normalizeImportLoteNumber,
  normalizeImportQuadra,
  normalizeLegacyContractPdfFileName,
  parseLegacyContractDate,
  parseLegacyContractStatus,
} from '@/lib/imports/modules/legacy-contracts/normalize';
import type {
  LegacyContractColumnMappingResult,
  ParsedLegacyContractRow,
} from '@/lib/imports/modules/legacy-contracts/types';
import { parseImportSpreadsheetBuffer } from '@/lib/imports/modules/customers/parseFile';
import { normalizeCpfCnpj } from '@/lib/inputMasks';

function isExampleRow(empreendimento: string, observacoes: string): boolean {
  const combined = `${empreendimento} ${observacoes}`.toUpperCase();
  return combined.includes('EXEMPLO');
}

export function mapRawRowsToLegacyContractRows(
  rawRows: Record<string, string>[],
  columnMapping: LegacyContractColumnMappingResult,
): ParsedLegacyContractRow[] {
  const rows: ParsedLegacyContractRow[] = [];

  rawRows.forEach((rawRow, index) => {
    const empreendimento = pickMappedLegacyContractCell(
      rawRow,
      columnMapping.mapping,
      'empreendimento',
    );
    const observacoes = pickMappedLegacyContractCell(rawRow, columnMapping.mapping, 'observacoes');
    const allEmpty = LEGACY_CONTRACTS_IMPORT_TEMPLATE_COLUMNS.every(
      (field) => pickMappedLegacyContractCell(rawRow, columnMapping.mapping, field) === '',
    );
    if (allEmpty) return;
    if (isExampleRow(empreendimento, observacoes)) return;

    const dataContrato = parseLegacyContractDate(
      pickMappedLegacyContractCell(rawRow, columnMapping.mapping, 'data_contrato'),
    );
    const status = parseLegacyContractStatus(
      pickMappedLegacyContractCell(rawRow, columnMapping.mapping, 'status_contrato'),
    );
    const pdfName = pickMappedLegacyContractCell(
      rawRow,
      columnMapping.mapping,
      'nome_arquivo_pdf',
    );

    rows.push({
      lineNumber: index + 2,
      raw: rawRow,
      cliente_cpf_cnpj: pickMappedLegacyContractCell(
        rawRow,
        columnMapping.mapping,
        'cliente_cpf_cnpj',
      ),
      cliente_cpf_cnpj_digits: normalizeCpfCnpj(
        pickMappedLegacyContractCell(rawRow, columnMapping.mapping, 'cliente_cpf_cnpj'),
      ),
      cliente_email: pickMappedLegacyContractCell(rawRow, columnMapping.mapping, 'cliente_email'),
      cliente_email_normalized: normalizeImportEmail(
        pickMappedLegacyContractCell(rawRow, columnMapping.mapping, 'cliente_email'),
      ),
      empreendimento,
      empreendimento_normalized: normalizeImportEntityName(empreendimento),
      quadra: pickMappedLegacyContractCell(rawRow, columnMapping.mapping, 'quadra'),
      quadra_normalized: normalizeImportQuadra(
        pickMappedLegacyContractCell(rawRow, columnMapping.mapping, 'quadra'),
      ),
      lote: pickMappedLegacyContractCell(rawRow, columnMapping.mapping, 'lote'),
      lote_normalized: normalizeImportLoteNumber(
        pickMappedLegacyContractCell(rawRow, columnMapping.mapping, 'lote'),
      ),
      numero_contrato_antigo: pickMappedLegacyContractCell(
        rawRow,
        columnMapping.mapping,
        'numero_contrato_antigo',
      ),
      data_contrato_raw: pickMappedLegacyContractCell(
        rawRow,
        columnMapping.mapping,
        'data_contrato',
      ),
      data_contrato: dataContrato.value,
      status_contrato_raw: pickMappedLegacyContractCell(
        rawRow,
        columnMapping.mapping,
        'status_contrato',
      ),
      status_contrato: status.value,
      nome_arquivo_pdf: pdfName,
      nome_arquivo_pdf_normalized: normalizeLegacyContractPdfFileName(pdfName),
      observacoes,
    });
  });

  return rows;
}

export function parseLegacyContractImportFile(
  buffer: Buffer | ArrayBuffer,
  fileName: string,
): {
  parsed: ReturnType<typeof parseImportSpreadsheetBuffer>;
  columnMapping: LegacyContractColumnMappingResult;
  rows: ParsedLegacyContractRow[];
} {
  const parsed = parseImportSpreadsheetBuffer(buffer, fileName);
  const columnMapping = mapLegacyContractImportColumns(parsed.headers);
  const rows = columnMapping.missingRequired.length
    ? []
    : mapRawRowsToLegacyContractRows(parsed.rawRows, columnMapping);

  return { parsed, columnMapping, rows };
}
