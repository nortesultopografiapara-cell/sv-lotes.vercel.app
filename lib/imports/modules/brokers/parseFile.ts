/**
 * Leitura de planilhas — importação de corretores.
 */

import {
  mapBrokerImportColumns,
  pickMappedBrokerCell,
} from '@/lib/imports/modules/brokers/columnMapping';
import {
  normalizeBrokerEmail,
  parseBrokerActiveFlag,
  parseBrokerCommissionPercent,
} from '@/lib/imports/modules/brokers/normalize';
import type {
  BrokerColumnMappingResult,
  ParsedBrokerRow,
} from '@/lib/imports/modules/brokers/types';
import { parseImportSpreadsheetBuffer } from '@/lib/imports/modules/customers/parseFile';
import { normalizeCpfCnpj, normalizePhoneDigits } from '@/lib/inputMasks';

const BROKER_IMPORT_ROW_FIELDS = [
  'nome',
  'cpf_cnpj',
  'telefone',
  'whatsapp',
  'email',
  'percentual_comissao',
  'observacoes',
  'ativo',
] as const;

function isExampleRow(nome: string): boolean {
  return nome.toUpperCase().includes('EXEMPLO');
}

export function mapRawRowsToBrokerRows(
  rawRows: Record<string, string>[],
  columnMapping: BrokerColumnMappingResult,
): ParsedBrokerRow[] {
  const rows: ParsedBrokerRow[] = [];

  rawRows.forEach((rawRow, index) => {
    const nome = pickMappedBrokerCell(rawRow, columnMapping.mapping, 'nome');
    const allEmpty = BROKER_IMPORT_ROW_FIELDS.every(
      (field) => pickMappedBrokerCell(rawRow, columnMapping.mapping, field) === '',
    );
    if (allEmpty) return;
    if (isExampleRow(nome)) return;

    const telefoneRaw = pickMappedBrokerCell(rawRow, columnMapping.mapping, 'telefone');
    const whatsappRaw = pickMappedBrokerCell(rawRow, columnMapping.mapping, 'whatsapp');
    const emailRaw = pickMappedBrokerCell(rawRow, columnMapping.mapping, 'email');
    const commissionRaw = pickMappedBrokerCell(
      rawRow,
      columnMapping.mapping,
      'percentual_comissao',
    );
    const ativoRaw = pickMappedBrokerCell(rawRow, columnMapping.mapping, 'ativo');
    const commission = parseBrokerCommissionPercent(commissionRaw);
    const active = parseBrokerActiveFlag(ativoRaw);

    rows.push({
      lineNumber: index + 2,
      raw: rawRow,
      nome,
      cpf_cnpj: pickMappedBrokerCell(rawRow, columnMapping.mapping, 'cpf_cnpj'),
      cpf_cnpj_digits: normalizeCpfCnpj(
        pickMappedBrokerCell(rawRow, columnMapping.mapping, 'cpf_cnpj'),
      ),
      telefone: telefoneRaw,
      telefone_digits: normalizePhoneDigits(telefoneRaw),
      whatsapp: whatsappRaw,
      whatsapp_digits: normalizePhoneDigits(whatsappRaw),
      email: emailRaw,
      email_normalized: normalizeBrokerEmail(emailRaw),
      percentual_comissao_raw: commissionRaw,
      percentual_comissao: commission.value,
      observacoes: pickMappedBrokerCell(rawRow, columnMapping.mapping, 'observacoes'),
      ativo_raw: ativoRaw,
      ativo: active.value,
    });
  });

  return rows;
}

export function parseBrokerImportFile(
  buffer: Buffer | ArrayBuffer,
  fileName: string,
): {
  parsed: ReturnType<typeof parseImportSpreadsheetBuffer>;
  columnMapping: BrokerColumnMappingResult;
  rows: ParsedBrokerRow[];
} {
  const parsed = parseImportSpreadsheetBuffer(buffer, fileName);
  const columnMapping = mapBrokerImportColumns(parsed.headers);
  const rows = columnMapping.missingRequired.length
    ? []
    : mapRawRowsToBrokerRows(parsed.rawRows, columnMapping);

  return { parsed, columnMapping, rows };
}
