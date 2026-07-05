/**
 * Mapeamento de colunas — importação de vendas.
 */

import {
  SALES_IMPORT_FIELD_ALIASES,
  SALES_IMPORT_REQUIRED_FIELDS,
} from '@/lib/imports/modules/sales/constants';
import type {
  SaleColumnMapping,
  SaleColumnMappingResult,
  SaleImportField,
} from '@/lib/imports/modules/sales/types';
import { normalizeImportHeader } from '@/lib/imports/modules/customers/columnMapping';

export function mapSaleImportColumns(headers: string[]): SaleColumnMappingResult {
  const normalizedHeaders = headers.map((header, index) => ({
    original: header,
    normalized: normalizeImportHeader(header),
    index,
  }));

  const mapping: SaleColumnMapping = {};
  const recognizedHeaders: SaleColumnMappingResult['recognizedHeaders'] = {};
  const usedHeaderIndexes = new Set<number>();
  const fields = Object.keys(SALES_IMPORT_FIELD_ALIASES) as SaleImportField[];

  for (const field of fields) {
    const aliases = SALES_IMPORT_FIELD_ALIASES[field].map(normalizeImportHeader);
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

  const missingRequired = SALES_IMPORT_REQUIRED_FIELDS.filter((field) => !mapping[field]);

  return {
    mapping,
    unmappedHeaders,
    missingRequired,
    recognizedHeaders,
  };
}

export function getSaleColumnMappingErrorMessage(
  result: SaleColumnMappingResult,
): string | null {
  if (result.missingRequired.length === 0) return null;

  const labels: Record<SaleImportField, string> = {
    cliente_cpf_cnpj: 'cliente_cpf_cnpj',
    cliente_email: 'cliente_email',
    cliente_telefone: 'cliente_telefone',
    corretor_cpf_cnpj: 'corretor_cpf_cnpj',
    corretor_email: 'corretor_email',
    corretor_nome: 'corretor_nome',
    empreendimento: 'empreendimento',
    quadra: 'quadra',
    lote: 'lote',
    data_venda: 'data_venda',
    valor_total: 'valor_total',
    entrada: 'entrada',
    sinal: 'sinal',
    saldo: 'saldo',
    quantidade_parcelas: 'quantidade_parcelas',
    vencimento_primeira_parcela: 'vencimento_primeira_parcela',
    percentual_comissao: 'percentual_comissao',
    status: 'status',
    observacoes: 'observacoes',
  };

  const missing = result.missingRequired.map((field) => labels[field]).join(', ');
  return `Não foi possível reconhecer a(s) coluna(s) obrigatória(s): ${missing}. Verifique o cabeçalho da planilha ou baixe o modelo oficial.`;
}

export function pickMappedSaleCell(
  rawRow: Record<string, string>,
  mapping: SaleColumnMapping,
  field: SaleImportField,
): string {
  const header = mapping[field];
  if (!header) return '';
  return String(rawRow[header] ?? '').trim();
}
