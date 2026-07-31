import {
  CORPORATE_PAYMENT_METHODS,
  CORPORATE_PAYMENT_ORIGINS,
  type CorporatePaymentMethod,
  type CorporatePaymentOrigin,
  type MasterCorporatePayableInput,
  type MasterCorporateReceivableInput,
  type MasterCorporateSettlementInput,
} from './arApTypes';
import { CORPORATE_BUSINESS_UNITS, type CorporateBusinessUnit } from './types';
import { computeNetAmount, roundMoney } from './arApMath';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanText(value: unknown, max = 500): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function cleanRequired(value: unknown, field: string, max = 200): string {
  const s = cleanText(value, max);
  if (!s) throw new Error(`${field} é obrigatório.`);
  return s;
}

function parseDate(value: unknown, field: string): string {
  const s = cleanRequired(value, field, 32);
  if (!DATE_RE.test(s)) throw new Error(`${field} inválida.`);
  return s;
}

function parseMoney(value: unknown, field: string, fallback = 0): number {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${field} inválido.`);
  if (n < 0) throw new Error(`${field} não pode ser negativo.`);
  return roundMoney(n);
}

function parseOptionalMoney(value: unknown, field: string): number {
  return parseMoney(value, field, 0);
}

function parseOptionalUuid(value: unknown, field: string): string | null {
  if (value == null || value === '') return null;
  return cleanRequired(value, field, 64);
}

function parseOptionalInt(value: unknown, field: string): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new Error(`${field} inválido.`);
  }
  return n;
}

function parsePaymentMethod(value: unknown, required: boolean): CorporatePaymentMethod | null {
  if (value == null || value === '') {
    if (required) throw new Error('Forma de pagamento é obrigatória.');
    return null;
  }
  const s = String(value).trim().toUpperCase();
  if (!(CORPORATE_PAYMENT_METHODS as readonly string[]).includes(s)) {
    throw new Error('Forma de pagamento inválida.');
  }
  return s as CorporatePaymentMethod;
}

function parseOrigin(value: unknown): CorporatePaymentOrigin {
  if (value == null || value === '') return 'MANUAL';
  const s = String(value).trim().toUpperCase();
  if (!(CORPORATE_PAYMENT_ORIGINS as readonly string[]).includes(s)) {
    throw new Error('Origem inválida.');
  }
  return s as CorporatePaymentOrigin;
}

function parseBusinessUnit(value: unknown, required = true): CorporateBusinessUnit {
  if (value == null || value === '') {
    if (required) throw new Error('Unidade de negócio é obrigatória.');
    return 'SV_TOPOGRAFIA';
  }
  const s = String(value).trim().toUpperCase();
  if (!(CORPORATE_BUSINESS_UNITS as readonly string[]).includes(s)) {
    throw new Error('Unidade de negócio inválida.');
  }
  return s as CorporateBusinessUnit;
}

function parseOptionalEmail(value: unknown): string | null {
  const s = cleanText(value, 200);
  if (!s) return null;
  if (!EMAIL_RE.test(s)) throw new Error('E-mail inválido.');
  return s;
}

function parseAmounts(raw: Record<string, unknown>) {
  const original_amount = parseMoney(
    raw.original_amount ?? raw.originalAmount,
    'Valor original',
  );
  const discount_amount = parseOptionalMoney(
    raw.discount_amount ?? raw.discountAmount,
    'Desconto',
  );
  const interest_amount = parseOptionalMoney(
    raw.interest_amount ?? raw.interestAmount,
    'Juros',
  );
  const fine_amount = parseOptionalMoney(raw.fine_amount ?? raw.fineAmount, 'Multa');
  computeNetAmount({
    original_amount,
    discount_amount,
    interest_amount,
    fine_amount,
  });
  return { original_amount, discount_amount, interest_amount, fine_amount };
}

function parseInstallments(raw: Record<string, unknown>) {
  const installment_number = parseOptionalInt(
    raw.installment_number ?? raw.installmentNumber,
    'Número da parcela',
  );
  const installment_total = parseOptionalInt(
    raw.installment_total ?? raw.installmentTotal,
    'Total de parcelas',
  );
  if ((installment_number == null) !== (installment_total == null)) {
    throw new Error('Informe número e total de parcelas juntos.');
  }
  if (
    installment_number != null &&
    installment_total != null &&
    installment_number > installment_total
  ) {
    throw new Error('Número da parcela não pode exceder o total.');
  }
  return { installment_number, installment_total };
}

export function validateReceivableInput(
  raw: Record<string, unknown>,
): MasterCorporateReceivableInput {
  const amounts = parseAmounts(raw);
  const installments = parseInstallments(raw);
  const statusRaw = String(raw.status || 'OPEN').trim().toUpperCase();
  const status = statusRaw === 'DRAFT' ? 'DRAFT' : 'OPEN';
  const business_unit = parseBusinessUnit(raw.business_unit ?? raw.businessUnit, true);
  const already_received = Boolean(
    raw.already_received ?? raw.alreadyReceived ?? raw.received_on_create,
  );

  let settlement: MasterCorporateSettlementInput | null = null;
  if (already_received) {
    const settleRaw =
      (raw.settlement as Record<string, unknown> | undefined) ||
      (raw.settlement_payload as Record<string, unknown> | undefined) ||
      raw;
    settlement = validateSettlementInput({
      financial_account_id:
        settleRaw.financial_account_id ??
        settleRaw.financialAccountId ??
        raw.financial_account_id ??
        raw.financialAccountId,
      payment_date:
        settleRaw.payment_date ??
        settleRaw.paymentDate ??
        raw.payment_date ??
        raw.paymentDate ??
        raw.issue_date ??
        raw.issueDate,
      amount:
        settleRaw.amount ??
        computeNetAmount({
          original_amount: amounts.original_amount,
          discount_amount: amounts.discount_amount,
          interest_amount: amounts.interest_amount,
          fine_amount: amounts.fine_amount,
        }),
      payment_method:
        settleRaw.payment_method ??
        settleRaw.paymentMethod ??
        raw.payment_method ??
        raw.paymentMethod,
      reference: settleRaw.reference ?? raw.reference ?? null,
      notes: settleRaw.notes ?? null,
      origin: settleRaw.origin ?? 'MANUAL',
      idempotency_key: settleRaw.idempotency_key ?? settleRaw.idempotencyKey ?? null,
      asaas_payment_id:
        settleRaw.asaas_payment_id ??
        settleRaw.asaasPaymentId ??
        raw.asaas_payment_id ??
        raw.asaasPaymentId ??
        null,
    });
  }

  const financial_account_id = parseOptionalUuid(
    raw.financial_account_id ?? raw.financialAccountId,
    'Conta financeira',
  );
  if (already_received && !financial_account_id && !settlement?.financial_account_id) {
    throw new Error('Conta financeira é obrigatória para recebível já recebido.');
  }

  return {
    description: cleanRequired(raw.description, 'Descrição', 500),
    customer_name: cleanRequired(
      raw.customer_name ?? raw.customerName,
      'Cliente',
      200,
    ),
    customer_document: cleanText(raw.customer_document ?? raw.customerDocument, 40),
    customer_phone: cleanText(raw.customer_phone ?? raw.customerPhone, 40),
    customer_email: parseOptionalEmail(raw.customer_email ?? raw.customerEmail),
    project_id: parseOptionalUuid(raw.project_id ?? raw.projectId, 'Projeto'),
    quote_id: parseOptionalUuid(raw.quote_id ?? raw.quoteId, 'Orçamento'),
    category_id: cleanRequired(raw.category_id ?? raw.categoryId, 'Categoria', 64),
    cost_center_id: parseOptionalUuid(raw.cost_center_id ?? raw.costCenterId, 'Centro'),
    financial_account_id:
      financial_account_id || settlement?.financial_account_id || null,
    business_unit,
    issue_date: parseDate(raw.issue_date ?? raw.issueDate, 'Data de emissão'),
    competence_date: parseDate(
      raw.competence_date ?? raw.competenceDate,
      'Data de competência',
    ),
    due_date: parseDate(raw.due_date ?? raw.dueDate, 'Data de vencimento'),
    ...amounts,
    payment_method: parsePaymentMethod(
      raw.payment_method ?? raw.paymentMethod ?? settlement?.payment_method,
      already_received,
    ),
    ...installments,
    notes: cleanText(raw.notes, 4000),
    status: already_received ? 'OPEN' : status,
    already_received,
    settlement,
  };
}

export function validatePayableInput(raw: Record<string, unknown>): MasterCorporatePayableInput {
  const amounts = parseAmounts(raw);
  const installments = parseInstallments(raw);
  const statusRaw = String(raw.status || 'OPEN').trim().toUpperCase();
  const status = statusRaw === 'DRAFT' ? 'DRAFT' : 'OPEN';

  return {
    description: cleanRequired(raw.description, 'Descrição', 500),
    supplier_name: cleanRequired(
      raw.supplier_name ?? raw.supplierName,
      'Fornecedor',
      200,
    ),
    supplier_document: cleanText(raw.supplier_document ?? raw.supplierDocument, 40),
    supplier_phone: cleanText(raw.supplier_phone ?? raw.supplierPhone, 40),
    supplier_email: parseOptionalEmail(raw.supplier_email ?? raw.supplierEmail),
    project_id: parseOptionalUuid(raw.project_id ?? raw.projectId, 'Projeto'),
    category_id: cleanRequired(raw.category_id ?? raw.categoryId, 'Categoria', 64),
    cost_center_id: parseOptionalUuid(raw.cost_center_id ?? raw.costCenterId, 'Centro'),
    financial_account_id: parseOptionalUuid(
      raw.financial_account_id ?? raw.financialAccountId,
      'Conta financeira',
    ),
    issue_date: parseDate(raw.issue_date ?? raw.issueDate, 'Data de emissão'),
    competence_date: parseDate(
      raw.competence_date ?? raw.competenceDate,
      'Data de competência',
    ),
    due_date: parseDate(raw.due_date ?? raw.dueDate, 'Data de vencimento'),
    ...amounts,
    payment_method: parsePaymentMethod(raw.payment_method ?? raw.paymentMethod, false),
    ...installments,
    notes: cleanText(raw.notes, 4000),
    status,
  };
}

export function validateSettlementInput(
  raw: Record<string, unknown>,
): MasterCorporateSettlementInput {
  const amount = parseMoney(raw.amount, 'Valor');
  if (amount <= 0) throw new Error('Valor deve ser maior que zero.');

  const asaas_payment_id = cleanText(
    raw.asaas_payment_id ?? raw.asaasPaymentId,
    120,
  );
  const reference =
    cleanText(raw.reference, 200) || asaas_payment_id;
  const idempotency_key =
    cleanText(raw.idempotency_key ?? raw.idempotencyKey, 120) ||
    (asaas_payment_id ? `ASAAS_PAY:${asaas_payment_id}` : null);

  return {
    financial_account_id: cleanRequired(
      raw.financial_account_id ?? raw.financialAccountId,
      'Conta financeira',
      64,
    ),
    payment_date: parseDate(raw.payment_date ?? raw.paymentDate, 'Data do pagamento'),
    amount,
    payment_method: parsePaymentMethod(
      raw.payment_method ?? raw.paymentMethod,
      true,
    ) as CorporatePaymentMethod,
    reference,
    notes: cleanText(raw.notes, 2000),
    origin: parseOrigin(raw.origin),
    idempotency_key,
    asaas_payment_id,
  };
}
