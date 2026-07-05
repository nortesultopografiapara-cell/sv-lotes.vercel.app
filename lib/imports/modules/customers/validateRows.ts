/**
 * Validação linha a linha — importação de clientes.
 */

import { isValidBrazilianTaxDocument, normalizePhone } from '@/lib/customerIdentity';
import type {
  CustomerImportRowMessage,
  CustomerImportSummary,
  CustomerRowStatus,
  ExistingCustomerIndex,
  ParsedCustomerRow,
  ValidatedCustomerRow,
} from '@/lib/imports/modules/customers/types';
import { formatCep, formatCpfCnpj } from '@/lib/inputMasks';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export function isValidImportEmail(value: string): boolean {
  if (!value.trim()) return true;
  return EMAIL_PATTERN.test(value.trim());
}

export function buildNamePhoneKey(name: string, phoneDigits: string): string {
  const normalizedName = String(name || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
  const phone = normalizePhone(phoneDigits);
  if (!normalizedName || !phone) return '';
  return `${normalizedName}::${phone}`;
}

export function buildExistingCustomerIndex(
  customers: Array<{
    id: string;
    name?: string | null;
    cpf_cnpj?: string | null;
    document?: string | null;
    phone?: string | null;
  }>,
): ExistingCustomerIndex {
  const byCpfDigits = new Map<string, { id: string; name: string }>();
  const byNamePhone = new Map<string, { id: string; name: string }>();

  for (const customer of customers) {
    const cpfDigits =
      String(customer.cpf_cnpj || customer.document || '').replace(/\D/g, '') || '';
    if (cpfDigits) {
      byCpfDigits.set(cpfDigits, {
        id: customer.id,
        name: customer.name || '',
      });
    }

    const namePhoneKey = buildNamePhoneKey(customer.name || '', customer.phone || '');
    if (namePhoneKey) {
      byNamePhone.set(namePhoneKey, {
        id: customer.id,
        name: customer.name || '',
      });
    }
  }

  return { byCpfDigits, byNamePhone };
}

function resolvePhoneFields(row: ParsedCustomerRow): {
  phone: string;
  phoneDigits: string;
  messages: CustomerImportRowMessage[];
} {
  const messages: CustomerImportRowMessage[] = [];
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

function validateSingleRow(
  row: ParsedCustomerRow,
  existing: ExistingCustomerIndex,
  spreadsheetCpfCounts: Map<string, number>,
  spreadsheetNamePhoneCounts: Map<string, number>,
): ValidatedCustomerRow {
  const messages: CustomerImportRowMessage[] = [];
  let status: CustomerRowStatus = 'valid';

  const pushMessage = (message: CustomerImportRowMessage) => {
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
  } else {
    pushMessage({
      level: 'warning',
      text: 'CPF/CNPJ não informado — recomendado para evitar duplicidades.',
    });
  }

  if (row.email && !isValidImportEmail(row.email)) {
    pushMessage({ level: 'error', text: 'E-mail com formato inválido.' });
  }

  if (row.uf && row.uf.length !== 2) {
    pushMessage({ level: 'error', text: 'UF deve conter exatamente 2 caracteres.' });
  }

  const phoneFields = resolvePhoneFields(row);
  messages.push(...phoneFields.messages);

  if (row.observacoes.trim()) {
    pushMessage({
      level: 'warning',
      text: 'Observações serão registradas apenas no histórico da migração.',
    });
  }

  const namePhoneKey = buildNamePhoneKey(row.nome, phoneFields.phoneDigits);

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
        text: `Cliente já cadastrado no sistema (${existingByCpf.name || 'sem nome'}).`,
      });
    }
  } else if (namePhoneKey) {
    const dupCount = spreadsheetNamePhoneCounts.get(namePhoneKey) ?? 0;
    if (dupCount > 1 && status !== 'error') {
      status = 'duplicate';
      messages.push({
        level: 'error',
        text: 'Possível duplicidade na planilha (nome + telefone).',
      });
    }

    const existingByNamePhone = existing.byNamePhone.get(namePhoneKey);
    if (existingByNamePhone) {
      status = 'existing';
      messages.push({
        level: 'error',
        text: `Possível cliente já cadastrado (${existingByNamePhone.name || 'sem nome'}).`,
      });
    }
  }

  const importable = status === 'valid' || status === 'warning';

  return {
    ...row,
    telefone: phoneFields.phone || row.telefone,
    telefone_digits: phoneFields.phoneDigits,
    status,
    messages,
    importable,
  };
}

export function validateCustomerRows(
  rows: ParsedCustomerRow[],
  existing: ExistingCustomerIndex,
): { rows: ValidatedCustomerRow[]; summary: CustomerImportSummary } {
  const spreadsheetCpfCounts = new Map<string, number>();
  const spreadsheetNamePhoneCounts = new Map<string, number>();

  for (const row of rows) {
    if (row.cpf_cnpj_digits) {
      spreadsheetCpfCounts.set(
        row.cpf_cnpj_digits,
        (spreadsheetCpfCounts.get(row.cpf_cnpj_digits) ?? 0) + 1,
      );
    } else {
      const phoneDigits = row.telefone_digits || row.whatsapp_digits;
      const key = buildNamePhoneKey(row.nome, phoneDigits);
      if (key) {
        spreadsheetNamePhoneCounts.set(key, (spreadsheetNamePhoneCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const validatedRows = rows.map((row) =>
    validateSingleRow(row, existing, spreadsheetCpfCounts, spreadsheetNamePhoneCounts),
  );

  const summary: CustomerImportSummary = {
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

export function buildCustomerInsertPayload(
  row: ValidatedCustomerRow,
  tenantId: string,
): Record<string, unknown> {
  const cpfFormatted = row.cpf_cnpj_digits ? formatCpfCnpj(row.cpf_cnpj_digits) : null;
  const cepFormatted = row.cep_digits ? formatCep(row.cep_digits) : null;
  const civilState = row.estado_civil.trim().toUpperCase() || null;

  return {
    tenant_id: tenantId,
    company_id: tenantId,
    name: row.nome.trim().toUpperCase(),
    cpf_cnpj: cpfFormatted,
    document: cpfFormatted,
    phone: row.telefone_digits || row.telefone.trim() || null,
    email: row.email.trim().toUpperCase() || null,
    address: row.endereco.trim().toUpperCase() || null,
    rg: row.rg.trim() || null,
    profession: row.profissao.trim().toUpperCase() || null,
    marital_status: civilState,
    civil_state: civilState,
    city: row.cidade.trim().toUpperCase() || null,
    state: row.uf.trim().toUpperCase() || null,
    state_uf: row.uf.trim().toUpperCase() || null,
    cep: cepFormatted,
    zip_code: cepFormatted,
    status: 'ativo',
  };
}

export function buildMigrationRowDetail(row: ValidatedCustomerRow) {
  return {
    lineNumber: row.lineNumber,
    nome: row.nome,
    cpf_cnpj: row.cpf_cnpj,
    status: row.status,
    messages: row.messages.map((message) => message.text),
    observacoes: row.observacoes || null,
  };
}
