/**
 * Leitura de planilhas — importação de vendas.
 */

import {
  mapSaleImportColumns,
  pickMappedSaleCell,
  pickMappedSaleImportCell,
} from '@/lib/imports/modules/sales/columnMapping';
import { SALES_IMPORT_TEMPLATE_COLUMNS } from '@/lib/imports/modules/sales/constants';
import {
  normalizeImportEmail,
  normalizeImportEntityName,
  normalizeImportLoteNumber,
  normalizeImportQuadra,
  parseSaleCommissionPercent,
  parseSaleImportCurrency,
  parseSaleImportDate,
  parseSaleImportStatus,
  parseSaleInstallmentsCount,
  resolveSaleBalance,
} from '@/lib/imports/modules/sales/normalize';
import type { ParsedSaleRow, SaleColumnMappingResult } from '@/lib/imports/modules/sales/types';
import { parseImportSpreadsheetBuffer } from '@/lib/imports/modules/customers/parseFile';
import { normalizeCpfCnpj, normalizePhoneDigits } from '@/lib/inputMasks';

function isExampleRow(empreendimento: string, corretorNome: string): boolean {
  const combined = `${empreendimento} ${corretorNome}`.toUpperCase();
  return combined.includes('EXEMPLO');
}

export function mapRawRowsToSaleRows(
  rawRows: Record<string, string>[],
  columnMapping: SaleColumnMappingResult,
  importCellRows: Record<string, unknown>[] = [],
): ParsedSaleRow[] {
  const rows: ParsedSaleRow[] = [];

  rawRows.forEach((rawRow, index) => {
    const importRow = importCellRows[index] || rawRow;
    const empreendimento = pickMappedSaleCell(rawRow, columnMapping.mapping, 'empreendimento');
    const corretorNome = pickMappedSaleCell(rawRow, columnMapping.mapping, 'corretor_nome');
    const allEmpty = SALES_IMPORT_TEMPLATE_COLUMNS.every(
      (field) => pickMappedSaleCell(rawRow, columnMapping.mapping, field) === '',
    );
    if (allEmpty) return;
    if (isExampleRow(empreendimento, corretorNome)) return;

    const valorTotalCell = pickMappedSaleImportCell(
      rawRow,
      importRow,
      columnMapping.mapping,
      'valor_total',
    );
    const entradaCell = pickMappedSaleImportCell(
      rawRow,
      importRow,
      columnMapping.mapping,
      'entrada',
    );
    const sinalCell = pickMappedSaleImportCell(
      rawRow,
      importRow,
      columnMapping.mapping,
      'sinal',
    );
    const saldoCell = pickMappedSaleImportCell(rawRow, importRow, columnMapping.mapping, 'saldo');
    const valorTotal = parseSaleImportCurrency(valorTotalCell.importValue);
    const entrada = parseSaleImportCurrency(entradaCell.importValue);
    const sinal = parseSaleImportCurrency(sinalCell.importValue);
    const saldoRaw = parseSaleImportCurrency(saldoCell.importValue);
    const dataVendaCell = pickMappedSaleImportCell(
      rawRow,
      importRow,
      columnMapping.mapping,
      'data_venda',
    );
    const vencimentoCell = pickMappedSaleImportCell(
      rawRow,
      importRow,
      columnMapping.mapping,
      'vencimento_primeira_parcela',
    );
    const dataVenda = parseSaleImportDate(dataVendaCell.importValue);
    const vencimento = parseSaleImportDate(vencimentoCell.importValue);
    const status = parseSaleImportStatus(
      pickMappedSaleCell(rawRow, columnMapping.mapping, 'status'),
    );
    const parcelasRaw = pickMappedSaleCell(rawRow, columnMapping.mapping, 'quantidade_parcelas');
    const commissionRaw = pickMappedSaleCell(rawRow, columnMapping.mapping, 'percentual_comissao');

    const valorTotalValue = valorTotal.value ?? 0;
    const entradaValue = entrada.value ?? 0;
    const sinalValue = sinal.value ?? 0;

    rows.push({
      lineNumber: index + 2,
      raw: rawRow,
      cliente_cpf_cnpj: pickMappedSaleCell(rawRow, columnMapping.mapping, 'cliente_cpf_cnpj'),
      cliente_cpf_cnpj_digits: normalizeCpfCnpj(
        pickMappedSaleCell(rawRow, columnMapping.mapping, 'cliente_cpf_cnpj'),
      ),
      cliente_email: pickMappedSaleCell(rawRow, columnMapping.mapping, 'cliente_email'),
      cliente_email_normalized: normalizeImportEmail(
        pickMappedSaleCell(rawRow, columnMapping.mapping, 'cliente_email'),
      ),
      cliente_telefone: pickMappedSaleCell(rawRow, columnMapping.mapping, 'cliente_telefone'),
      cliente_telefone_digits: normalizePhoneDigits(
        pickMappedSaleCell(rawRow, columnMapping.mapping, 'cliente_telefone'),
      ),
      corretor_cpf_cnpj: pickMappedSaleCell(rawRow, columnMapping.mapping, 'corretor_cpf_cnpj'),
      corretor_cpf_cnpj_digits: normalizeCpfCnpj(
        pickMappedSaleCell(rawRow, columnMapping.mapping, 'corretor_cpf_cnpj'),
      ),
      corretor_email: pickMappedSaleCell(rawRow, columnMapping.mapping, 'corretor_email'),
      corretor_email_normalized: normalizeImportEmail(
        pickMappedSaleCell(rawRow, columnMapping.mapping, 'corretor_email'),
      ),
      corretor_nome: corretorNome,
      corretor_nome_normalized: normalizeImportEntityName(corretorNome),
      empreendimento,
      empreendimento_normalized: normalizeImportEntityName(empreendimento),
      quadra: pickMappedSaleCell(rawRow, columnMapping.mapping, 'quadra'),
      quadra_normalized: normalizeImportQuadra(
        pickMappedSaleCell(rawRow, columnMapping.mapping, 'quadra'),
      ),
      lote: pickMappedSaleCell(rawRow, columnMapping.mapping, 'lote'),
      lote_normalized: normalizeImportLoteNumber(
        pickMappedSaleCell(rawRow, columnMapping.mapping, 'lote'),
      ),
      data_venda_raw: dataVendaCell.display,
      data_venda: dataVenda.value,
      valor_total_raw: valorTotalCell.display,
      valor_total: valorTotalValue,
      entrada_raw: entradaCell.display,
      entrada: entradaValue,
      sinal_raw: sinalCell.display,
      sinal: sinalValue,
      saldo_raw: saldoCell.display,
      saldo: resolveSaleBalance(valorTotalValue, entradaValue, sinalValue, saldoRaw.value),
      quantidade_parcelas_raw: parcelasRaw,
      quantidade_parcelas: parseSaleInstallmentsCount(parcelasRaw),
      vencimento_primeira_parcela_raw: vencimentoCell.display,
      vencimento_primeira_parcela: vencimento.value,
      percentual_comissao_raw: commissionRaw,
      percentual_comissao: parseSaleCommissionPercent(commissionRaw),
      status_raw: pickMappedSaleCell(rawRow, columnMapping.mapping, 'status'),
      status_normalized: status.normalized,
      observacoes: pickMappedSaleCell(rawRow, columnMapping.mapping, 'observacoes'),
    });
  });

  return rows;
}

export function parseSaleImportFile(
  buffer: Buffer | ArrayBuffer,
  fileName: string,
): {
  parsed: ReturnType<typeof parseImportSpreadsheetBuffer>;
  columnMapping: SaleColumnMappingResult;
  rows: ParsedSaleRow[];
} {
  const parsed = parseImportSpreadsheetBuffer(buffer, fileName);
  const columnMapping = mapSaleImportColumns(parsed.headers);
  const rows = columnMapping.missingRequired.length
    ? []
    : mapRawRowsToSaleRows(parsed.rawRows, columnMapping, parsed.importCellRows);

  return { parsed, columnMapping, rows };
}
