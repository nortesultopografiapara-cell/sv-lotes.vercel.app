/**
 * Leitura de planilhas — atualização de parcelas.
 */

import {
  mapInstallmentImportColumns,
  pickMappedInstallmentCell,
} from '@/lib/imports/modules/installments/columnMapping';
import {
  normalizeInstallmentCustomerName,
  parseInstallmentNumber,
  parseInstallmentStatus,
  parseSaleImportCurrency,
  parseSaleImportDate,
} from '@/lib/imports/modules/installments/normalize';
import type {
  InstallmentColumnMappingResult,
  ParsedInstallmentRow,
} from '@/lib/imports/modules/installments/types';
import { parseImportSpreadsheetBuffer } from '@/lib/imports/modules/customers/parseFile';
import {
  normalizeImportEntityName,
  normalizeImportLoteNumber,
  normalizeImportQuadra,
} from '@/lib/imports/modules/sales/normalize';

const INSTALLMENT_IMPORT_ROW_FIELDS = [
  'venda_id',
  'parcela_id',
  'empreendimento',
  'quadra',
  'lote',
  'cliente',
  'numero_parcela',
  'vencimento',
  'novo_vencimento',
  'status',
  'valor',
  'valor_pago',
  'data_pagamento',
  'observacoes',
] as const;

function isExampleRow(cliente: string, empreendimento: string): boolean {
  const combined = `${cliente} ${empreendimento}`.toUpperCase();
  return combined.includes('EXEMPLO');
}

export function mapRawRowsToInstallmentRows(
  rawRows: Record<string, string>[],
  columnMapping: InstallmentColumnMappingResult,
): ParsedInstallmentRow[] {
  const rows: ParsedInstallmentRow[] = [];

  rawRows.forEach((rawRow, index) => {
    const cliente = pickMappedInstallmentCell(rawRow, columnMapping.mapping, 'cliente');
    const empreendimento = pickMappedInstallmentCell(rawRow, columnMapping.mapping, 'empreendimento');
    const allEmpty = INSTALLMENT_IMPORT_ROW_FIELDS.every(
      (field) => pickMappedInstallmentCell(rawRow, columnMapping.mapping, field) === '',
    );
    if (allEmpty) return;
    if (isExampleRow(cliente, empreendimento)) return;

    const numeroRaw = pickMappedInstallmentCell(rawRow, columnMapping.mapping, 'numero_parcela');
    const numero = parseInstallmentNumber(numeroRaw);
    const statusRaw = pickMappedInstallmentCell(rawRow, columnMapping.mapping, 'status');
    const status = parseInstallmentStatus(statusRaw);
    const valorRaw = pickMappedInstallmentCell(rawRow, columnMapping.mapping, 'valor');
    const valorPagoRaw = pickMappedInstallmentCell(rawRow, columnMapping.mapping, 'valor_pago');
    const vencimentoRaw = pickMappedInstallmentCell(rawRow, columnMapping.mapping, 'vencimento');
    const novoVencimentoRaw = pickMappedInstallmentCell(
      rawRow,
      columnMapping.mapping,
      'novo_vencimento',
    );
    const dataPagamentoRaw = pickMappedInstallmentCell(
      rawRow,
      columnMapping.mapping,
      'data_pagamento',
    );

    rows.push({
      lineNumber: index + 2,
      raw: rawRow,
      venda_id: pickMappedInstallmentCell(rawRow, columnMapping.mapping, 'venda_id'),
      parcela_id: pickMappedInstallmentCell(rawRow, columnMapping.mapping, 'parcela_id'),
      empreendimento,
      empreendimento_normalized: normalizeImportEntityName(empreendimento),
      quadra: pickMappedInstallmentCell(rawRow, columnMapping.mapping, 'quadra'),
      quadra_normalized: normalizeImportQuadra(
        pickMappedInstallmentCell(rawRow, columnMapping.mapping, 'quadra'),
      ),
      lote: pickMappedInstallmentCell(rawRow, columnMapping.mapping, 'lote'),
      lote_normalized: normalizeImportLoteNumber(
        pickMappedInstallmentCell(rawRow, columnMapping.mapping, 'lote'),
      ),
      cliente,
      cliente_normalized: normalizeInstallmentCustomerName(cliente),
      numero_parcela_raw: numeroRaw,
      numero_parcela: numero.value,
      vencimento_raw: vencimentoRaw,
      vencimento: parseSaleImportDate(vencimentoRaw).value,
      novo_vencimento_raw: novoVencimentoRaw,
      novo_vencimento: parseSaleImportDate(novoVencimentoRaw).value,
      status_raw: statusRaw,
      status_normalized: status.value || '',
      valor_raw: valorRaw,
      valor: parseSaleImportCurrency(valorRaw).value,
      valor_pago_raw: valorPagoRaw,
      valor_pago: parseSaleImportCurrency(valorPagoRaw).value,
      data_pagamento_raw: dataPagamentoRaw,
      data_pagamento: parseSaleImportDate(dataPagamentoRaw).value,
      observacoes: pickMappedInstallmentCell(rawRow, columnMapping.mapping, 'observacoes'),
    });
  });

  return rows;
}

export function parseInstallmentImportFile(buffer: Buffer | ArrayBuffer, fileName: string) {
  const parsed = parseImportSpreadsheetBuffer(buffer, fileName);
  const columnMapping = mapInstallmentImportColumns(parsed.headers);
  const rows = mapRawRowsToInstallmentRows(parsed.rows, columnMapping);
  return { parsed, columnMapping, rows };
}
