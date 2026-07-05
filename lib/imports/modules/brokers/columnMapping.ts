/**
 * Mapeamento de colunas — importação de corretores.
 */

import {
  BROKER_IMPORT_FIELD_ALIASES,
  BROKER_IMPORT_REQUIRED_FIELDS,
} from '@/lib/imports/modules/brokers/constants';
import type {
  BrokerColumnMapping,
  BrokerColumnMappingResult,
  BrokerImportField,
} from '@/lib/imports/modules/brokers/types';
import { normalizeImportHeader } from '@/lib/imports/modules/customers/columnMapping';

export function mapBrokerImportColumns(headers: string[]): BrokerColumnMappingResult {
  const normalizedHeaders = headers.map((header, index) => ({
    original: header,
    normalized: normalizeImportHeader(header),
    index,
  }));

  const mapping: BrokerColumnMapping = {};
  const recognizedHeaders: BrokerColumnMappingResult['recognizedHeaders'] = {};
  const usedHeaderIndexes = new Set<number>();
  const fields = Object.keys(BROKER_IMPORT_FIELD_ALIASES) as BrokerImportField[];

  for (const field of fields) {
    const aliases = BROKER_IMPORT_FIELD_ALIASES[field].map(normalizeImportHeader);
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

  const missingRequired = BROKER_IMPORT_REQUIRED_FIELDS.filter((field) => !mapping[field]);

  return {
    mapping,
    unmappedHeaders,
    missingRequired,
    recognizedHeaders,
  };
}

export function getBrokerColumnMappingErrorMessage(
  result: BrokerColumnMappingResult,
): string | null {
  if (result.missingRequired.length === 0) return null;

  const labels: Record<BrokerImportField, string> = {
    nome: 'nome',
    cpf_cnpj: 'cpf_cnpj',
    telefone: 'telefone',
    whatsapp: 'whatsapp',
    email: 'email',
    percentual_comissao: 'percentual_comissao',
    observacoes: 'observacoes',
    ativo: 'ativo',
  };

  const missing = result.missingRequired.map((field) => labels[field]).join(', ');
  return `Não foi possível reconhecer a(s) coluna(s) obrigatória(s): ${missing}. Verifique o cabeçalho da planilha ou baixe o modelo oficial.`;
}

export function pickMappedBrokerCell(
  rawRow: Record<string, string>,
  mapping: BrokerColumnMapping,
  field: BrokerImportField,
): string {
  const header = mapping[field];
  if (!header) return '';
  return String(rawRow[header] ?? '').trim();
}
