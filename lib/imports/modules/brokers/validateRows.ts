/**
 * Validação linha a linha — importação de corretores.
 */

import {
  normalizeBrokerEmail,
  parseBrokerActiveFlag,
  parseBrokerCommissionPercent,
} from '@/lib/imports/modules/brokers/normalize';
import type {
  BrokerImportRowMessage,
  BrokerImportSummary,
  BrokerRowStatus,
  ExistingBrokerIndex,
  ParsedBrokerRow,
  ValidatedBrokerRow,
} from '@/lib/imports/modules/brokers/types';
import { formatCpfCnpj, isValidBrazilianTaxDocument, normalizePhoneDigits } from '@/lib/inputMasks';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export function isValidImportEmail(value: string): boolean {
  if (!value.trim()) return true;
  return EMAIL_PATTERN.test(value.trim());
}

function resolvePhoneFields(row: ParsedBrokerRow): {
  phone: string;
  phoneDigits: string;
  messages: BrokerImportRowMessage[];
} {
  const messages: BrokerImportRowMessage[] = [];
  const telefoneDigits = row.telefone_digits;
  const whatsappDigits = row.whatsapp_digits;

  if (telefoneDigits && whatsappDigits && telefoneDigits !== whatsappDigits) {
    messages.push({
      level: 'warning',
      text: 'Telefone e WhatsApp diferentes — será gravado o telefone principal.',
    });
  }

  if (telefoneDigits) {
    return { phone: row.telefone.trim(), phoneDigits: telefoneDigits, messages };
  }

  if (whatsappDigits) {
    return { phone: row.whatsapp.trim(), phoneDigits: whatsappDigits, messages };
  }

  return { phone: '', phoneDigits: '', messages };
}

export function buildExistingBrokerIndex(
  brokers: Array<{
    id: string;
    name?: string | null;
    cpf?: string | null;
    email?: string | null;
    phone?: string | null;
  }>,
): ExistingBrokerIndex {
  const byCpfDigits = new Map<string, { id: string; name: string }>();
  const byEmail = new Map<string, { id: string; name: string }>();
  const byPhone = new Map<string, { id: string; name: string }>();

  for (const broker of brokers) {
    const cpfDigits = String(broker.cpf || '').replace(/\D/g, '');
    if (cpfDigits) {
      byCpfDigits.set(cpfDigits, { id: broker.id, name: broker.name || '' });
    }

    const email = normalizeBrokerEmail(broker.email);
    if (email) {
      byEmail.set(email, { id: broker.id, name: broker.name || '' });
    }

    const phone = normalizePhoneDigits(broker.phone);
    if (phone) {
      byPhone.set(phone, { id: broker.id, name: broker.name || '' });
    }
  }

  return { byCpfDigits, byEmail, byPhone };
}

function validateSingleRow(
  row: ParsedBrokerRow,
  existing: ExistingBrokerIndex,
  spreadsheetCpfCounts: Map<string, number>,
  spreadsheetEmailCounts: Map<string, number>,
  spreadsheetPhoneCounts: Map<string, number>,
): ValidatedBrokerRow {
  const messages: BrokerImportRowMessage[] = [];
  let status: BrokerRowStatus = 'valid';

  const pushMessage = (message: BrokerImportRowMessage) => {
    messages.push(message);
    if (message.level === 'error') status = 'error';
    else if (message.level === 'warning' && status === 'valid') status = 'warning';
  };

  if (!row.nome.trim()) {
    pushMessage({ level: 'error', text: 'Nome é obrigatório.' });
  }

  if (row.cpf_cnpj_digits) {
    if (!isValidBrazilianTaxDocument(row.cpf_cnpj_digits)) {
      pushMessage({
        level: 'error',
        text: 'CPF/CNPJ informado não possui quantidade válida de dígitos (11 ou 14).',
      });
    }
  }

  if (row.email && !isValidImportEmail(row.email)) {
    pushMessage({ level: 'error', text: 'E-mail com formato inválido.' });
  }

  const commission = parseBrokerCommissionPercent(row.percentual_comissao_raw);
  if (commission.error) {
    pushMessage({ level: 'error', text: commission.error });
  }

  const active = parseBrokerActiveFlag(row.ativo_raw);
  if (active.warning) {
    pushMessage({ level: 'warning', text: active.warning });
  }

  const phoneFields = resolvePhoneFields(row);
  messages.push(...phoneFields.messages);

  if (row.observacoes.trim()) {
    pushMessage({
      level: 'warning',
      text: 'Observações serão registradas apenas no histórico da migração.',
    });
  }

  if (row.cpf_cnpj_digits) {
    const dupCount = spreadsheetCpfCounts.get(row.cpf_cnpj_digits) ?? 0;
    if (dupCount > 1 && status !== 'error') {
      status = 'duplicate';
      messages.push({
        level: 'error',
        text: 'CPF/CNPJ duplicado dentro da planilha.',
      });
    }
    const existingByCpf = existing.byCpfDigits.get(row.cpf_cnpj_digits);
    if (existingByCpf) {
      status = 'existing';
      messages.push({
        level: 'error',
        text: `Corretor já cadastrado no sistema (${existingByCpf.name || 'sem nome'}).`,
      });
    }
  }

  if (row.email_normalized && status !== 'existing') {
    const dupCount = spreadsheetEmailCounts.get(row.email_normalized) ?? 0;
    if (dupCount > 1 && status !== 'error') {
      status = 'duplicate';
      messages.push({
        level: 'error',
        text: 'E-mail duplicado dentro da planilha.',
      });
    }
    const existingByEmail = existing.byEmail.get(row.email_normalized);
    if (existingByEmail) {
      status = 'existing';
      messages.push({
        level: 'error',
        text: `Corretor já cadastrado no sistema (${existingByEmail.name || 'sem nome'}).`,
      });
    }
  }

  if (phoneFields.phoneDigits && status !== 'existing' && status !== 'error') {
    const dupCount = spreadsheetPhoneCounts.get(phoneFields.phoneDigits) ?? 0;
    if (dupCount > 1 && status !== 'error') {
      status = 'duplicate';
      messages.push({
        level: 'error',
        text: 'Telefone duplicado dentro da planilha.',
      });
    }
    const existingByPhone = existing.byPhone.get(phoneFields.phoneDigits);
    if (existingByPhone) {
      status = 'existing';
      messages.push({
        level: 'error',
        text: `Corretor já cadastrado no sistema (${existingByPhone.name || 'sem nome'}).`,
      });
    }
  }

  const importable = status === 'valid' || status === 'warning';

  return {
    ...row,
    percentual_comissao: commission.value,
    ativo: active.value,
    telefone: phoneFields.phone || row.telefone,
    telefone_digits: phoneFields.phoneDigits,
    status,
    messages,
    importable,
  };
}

export function validateBrokerRows(
  rows: ParsedBrokerRow[],
  existing: ExistingBrokerIndex,
): { rows: ValidatedBrokerRow[]; summary: BrokerImportSummary } {
  const spreadsheetCpfCounts = new Map<string, number>();
  const spreadsheetEmailCounts = new Map<string, number>();
  const spreadsheetPhoneCounts = new Map<string, number>();

  for (const row of rows) {
    if (row.cpf_cnpj_digits) {
      spreadsheetCpfCounts.set(
        row.cpf_cnpj_digits,
        (spreadsheetCpfCounts.get(row.cpf_cnpj_digits) ?? 0) + 1,
      );
    }
    if (row.email_normalized) {
      spreadsheetEmailCounts.set(
        row.email_normalized,
        (spreadsheetEmailCounts.get(row.email_normalized) ?? 0) + 1,
      );
    }
    const phoneDigits = row.telefone_digits || row.whatsapp_digits;
    if (phoneDigits) {
      spreadsheetPhoneCounts.set(
        phoneDigits,
        (spreadsheetPhoneCounts.get(phoneDigits) ?? 0) + 1,
      );
    }
  }

  const validatedRows = rows.map((row) => {
    try {
      return validateSingleRow(
        row,
        existing,
        spreadsheetCpfCounts,
        spreadsheetEmailCounts,
        spreadsheetPhoneCounts,
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro interno ao validar a linha.';
      return {
        ...row,
        status: 'error' as const,
        messages: [{ level: 'error' as const, text: message }],
        importable: false,
      };
    }
  });

  const summary: BrokerImportSummary = {
    totalRows: validatedRows.length,
    validRows: validatedRows.filter((row) => row.status === 'valid').length,
    warningRows: validatedRows.filter((row) => row.status === 'warning').length,
    errorRows: validatedRows.filter((row) => row.status === 'error').length,
    duplicateRows: validatedRows.filter((row) => row.status === 'duplicate').length,
    existingRows: validatedRows.filter((row) => row.status === 'existing').length,
    ignoredRows: validatedRows.filter((row) => !row.importable).length,
    importableRows: validatedRows.filter((row) => row.importable).length,
  };

  return { rows: validatedRows, summary };
}

export function buildBrokerInsertPayload(
  row: ValidatedBrokerRow,
  tenantId: string,
): Record<string, unknown> {
  const cpfFormatted = row.cpf_cnpj_digits ? formatCpfCnpj(row.cpf_cnpj_digits) : null;

  return {
    tenant_id: tenantId,
    company_id: tenantId,
    name: row.nome.trim().toUpperCase(),
    cpf: cpfFormatted || row.cpf_cnpj_digits || null,
    phone: row.telefone_digits || row.telefone.trim() || null,
    email: row.email_normalized || null,
    commission_percent: row.percentual_comissao,
    active: row.ativo,
    role: 'BROKER',
    deleted_at: null,
  };
}

export function buildBrokerMigrationRowDetail(row: ValidatedBrokerRow) {
  return {
    lineNumber: row.lineNumber,
    nome: row.nome,
    cpf_cnpj: row.cpf_cnpj,
    email: row.email,
    percentual_comissao: row.percentual_comissao,
    status: row.status,
    messages: row.messages.map((message) => message.text),
    observacoes: row.observacoes || null,
  };
}
