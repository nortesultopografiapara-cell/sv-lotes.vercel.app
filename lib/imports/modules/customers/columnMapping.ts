/**
 * Normalização de cabeçalhos e mapeamento inteligente de colunas.
 */

import {
  CUSTOMER_IMPORT_FIELD_ALIASES,
  CUSTOMER_IMPORT_REQUIRED_FIELDS,
} from '@/lib/imports/modules/customers/constants';
import type {
  CustomerColumnMapping,
  CustomerColumnMappingResult,
  CustomerImportField,
} from '@/lib/imports/modules/customers/types';

export function normalizeImportHeader(value: string): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/\//g, '/');
}

export function mapCustomerImportColumns(headers: string[]): CustomerColumnMappingResult {
  const normalizedHeaders = headers.map((header, index) => ({
    original: header,
    normalized: normalizeImportHeader(header),
    index,
  }));

  const mapping: CustomerColumnMapping = {};
  const recognizedHeaders: CustomerColumnMappingResult['recognizedHeaders'] = {};
  const usedHeaderIndexes = new Set<number>();

  const fields = Object.keys(CUSTOMER_IMPORT_FIELD_ALIASES) as CustomerImportField[];

  for (const field of fields) {
    const aliases = CUSTOMER_IMPORT_FIELD_ALIASES[field].map(normalizeImportHeader);
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

  const missingRequired = CUSTOMER_IMPORT_REQUIRED_FIELDS.filter((field) => !mapping[field]);

  return {
    mapping,
    unmappedHeaders,
    missingRequired,
    recognizedHeaders,
  };
}

export function getColumnMappingErrorMessage(result: CustomerColumnMappingResult): string | null {
  if (result.missingRequired.length === 0) return null;

  const labels: Record<CustomerImportField, string> = {
    nome: 'nome',
    cpf_cnpj: 'cpf_cnpj',
    rg: 'rg',
    telefone: 'telefone',
    whatsapp: 'whatsapp',
    email: 'email',
    endereco: 'endereco',
    cidade: 'cidade',
    uf: 'uf',
    cep: 'cep',
    estado_civil: 'estado_civil',
    profissao: 'profissao',
    observacoes: 'observacoes',
  };

  const missing = result.missingRequired.map((field) => labels[field]).join(', ');
  return `Não foi possível reconhecer a(s) coluna(s) obrigatória(s): ${missing}. Verifique o cabeçalho da planilha ou baixe o modelo oficial.`;
}

export function pickMappedCell(
  rawRow: Record<string, string>,
  mapping: CustomerColumnMapping,
  field: CustomerImportField,
): string {
  const header = mapping[field];
  if (!header) return '';
  return String(rawRow[header] ?? '').trim();
}
