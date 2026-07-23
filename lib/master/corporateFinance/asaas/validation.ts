/** Validações — Asaas Corporativo MASTER (Fase 7.1). */

import { roundMoney } from '../arApMath';
import {
  CORPORATE_ASAAS_BILLING_TYPES,
  type CorporateAsaasBillingType,
  type CorporateAsaasCreateChargeInput,
} from './types';

function digitsOnly(v: string): string {
  return String(v || '').replace(/\D/g, '');
}

export function normalizeCpfCnpj(raw: string): string {
  const d = digitsOnly(raw);
  if (d.length !== 11 && d.length !== 14) {
    throw new Error('CPF/CNPJ inválido. Informe 11 ou 14 dígitos.');
  }
  return d;
}

export function validateCorporateAsaasCreateChargeInput(
  raw: Record<string, unknown>,
  opts: { remainingAmount: number; receivableDueDate: string },
): CorporateAsaasCreateChargeInput {
  const receivableId = String(raw.receivable_id || '').trim();
  if (!receivableId) throw new Error('receivable_id é obrigatório.');

  const billingRaw = String(raw.billing_type || '')
    .trim()
    .toUpperCase();
  if (!(CORPORATE_ASAAS_BILLING_TYPES as readonly string[]).includes(billingRaw)) {
    throw new Error('billing_type deve ser PIX, BOLETO ou UNDEFINED (PIX + Boleto).');
  }
  const billing_type = billingRaw as CorporateAsaasBillingType;

  const financial_account_id = String(raw.financial_account_id || '').trim();
  if (!financial_account_id) throw new Error('Conta financeira é obrigatória.');

  const remaining = roundMoney(opts.remainingAmount);
  if (remaining <= 0) {
    throw new Error('Conta a receber sem saldo pendente para cobrança.');
  }

  let value = remaining;
  if (raw.value !== undefined && raw.value !== null && String(raw.value).trim() !== '') {
    value = roundMoney(Number(raw.value));
  }
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Valor da cobrança inválido.');
  }
  if (value > remaining + 0.001) {
    throw new Error(
      `Valor da cobrança (R$ ${value.toFixed(2)}) maior que o saldo pendente (R$ ${remaining.toFixed(2)}).`,
    );
  }

  const partial_justification =
    raw.partial_justification != null
      ? String(raw.partial_justification).trim() || null
      : null;
  if (value < remaining - 0.001 && !partial_justification) {
    throw new Error(
      'Cobrança parcial exige justificativa (partial_justification).',
    );
  }

  const due_date = String(raw.due_date || opts.receivableDueDate || '')
    .trim()
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
    throw new Error('due_date inválida (use AAAA-MM-DD).');
  }

  const description =
    raw.description != null ? String(raw.description).trim() : undefined;
  if (description !== undefined && !description) {
    throw new Error('Descrição não pode ser vazia.');
  }

  const cpf_cnpj =
    raw.cpf_cnpj != null && String(raw.cpf_cnpj).trim()
      ? normalizeCpfCnpj(String(raw.cpf_cnpj))
      : undefined;

  return {
    receivable_id: receivableId,
    billing_type,
    financial_account_id,
    value,
    due_date,
    description,
    customer_name:
      raw.customer_name != null ? String(raw.customer_name).trim() || undefined : undefined,
    cpf_cnpj,
    email: raw.email != null ? String(raw.email).trim() || null : undefined,
    phone: raw.phone != null ? String(raw.phone).trim() || null : undefined,
    mobile_phone:
      raw.mobile_phone != null ? String(raw.mobile_phone).trim() || null : undefined,
    partial_justification,
  };
}

/** Remove campos sensíveis de payloads Asaas antes de persistir/auditar. */
export function sanitizeCorporateAsaasPayload(
  payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return {};
  const out: Record<string, unknown> = {};
  const allow = [
    'id',
    'event',
    'dateCreated',
    'payment',
    'status',
    'billingType',
    'value',
    'netValue',
    'dueDate',
    'paymentDate',
    'clientPaymentDate',
    'confirmedDate',
    'externalReference',
    'invoiceUrl',
    'bankSlipUrl',
    'transactionReceiptUrl',
    'description',
  ];
  for (const key of allow) {
    if (key in payload) out[key] = payload[key];
  }
  // Nested payment — só campos seguros
  const payment = payload.payment;
  if (payment && typeof payment === 'object') {
    const p = payment as Record<string, unknown>;
    out.payment = {
      id: p.id,
      status: p.status,
      billingType: p.billingType,
      value: p.value,
      netValue: p.netValue,
      dueDate: p.dueDate,
      paymentDate: p.paymentDate,
      clientPaymentDate: p.clientPaymentDate,
      confirmedDate: p.confirmedDate,
      externalReference: p.externalReference,
      invoiceUrl: p.invoiceUrl,
      bankSlipUrl: p.bankSlipUrl,
      transactionReceiptUrl: p.transactionReceiptUrl,
      description: p.description,
      customer: p.customer,
    };
  }
  return out;
}

export function sanitizeCorporateAsaasErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err || 'Erro Asaas');
  return msg
    .replace(/access_token[=:]\s*\S+/gi, 'access_token=[redacted]')
    .replace(/\$aact_[A-Za-z0-9_]+/g, '[redacted_key]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .slice(0, 500);
}
