/**
 * Cliente HTTP Asaas **Company** — usa API Key do tenant.
 * Nunca usar credencial Master SaaS — apenas apiKey do tenant.
 */
import type { BankEnvironment } from '@/lib/banking/types';
import {
  buildCompanyAsaasLateFeePayload,
  extractCompanyAsaasBankSlipIdentification,
} from '@/lib/finance/asaasCompanyLateFees';

export type AsaasCompanyPayment = {
  id?: string;
  status?: string;
  dueDate?: string;
  value?: number;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  identificationField?: string;
  nossoNumero?: string;
  barCode?: string;
  invoiceNumber?: string | number;
  paymentDate?: string;
  clientPaymentDate?: string;
  billingType?: string;
  creditDate?: string;
  estimatedCreditDate?: string;
  transactionReceiptUrl?: string;
};

export type AsaasCompanyPixQrCode = {
  encodedImage?: string;
  payload?: string;
};

export type AsaasCompanyIdentificationField = {
  identificationField?: string;
  nossoNumero?: string;
  barCode?: string;
};

export type AsaasCompanyCommercialInfo = {
  cpfCnpj?: string;
  companyName?: string;
  name?: string;
  email?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  province?: string;
  postalCode?: string;
  city?: string | { name?: string; state?: string };
};

export type AsaasCompanyCreateBillingType = 'PIX' | 'BOLETO' | 'UNDEFINED';

export function asaasCompanyBaseUrl(environment: BankEnvironment): string {
  return environment === 'PRODUCTION'
    ? 'https://api.asaas.com/v3'
    : 'https://api-sandbox.asaas.com/v3';
}

export function asaasCompanyHeaders(apiKey: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    access_token: apiKey,
    'User-Agent': 'SV-LOTES-Company/1.0',
  };
}

export async function asaasCompanyFetch<T>(
  apiKey: string,
  environment: BankEnvironment,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${asaasCompanyBaseUrl(environment)}${path}`, {
    ...init,
    headers: { ...asaasCompanyHeaders(apiKey), ...(init?.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (json as { errors?: Array<{ description?: string }> })?.errors?.[0]?.description ||
      (json as { message?: string })?.message ||
      `Asaas Company HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePixQrImage(encodedImage?: string | null): string {
  const raw = String(encodedImage || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:')) return raw;
  return `data:image/png;base64,${raw}`;
}

export async function asaasCompanyFetchPixQrCode(
  apiKey: string,
  environment: BankEnvironment,
  paymentId: string,
): Promise<AsaasCompanyPixQrCode> {
  const maxAttempts = 5;
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const pix = await asaasCompanyFetch<AsaasCompanyPixQrCode>(
        apiKey,
        environment,
        `/payments/${encodeURIComponent(paymentId)}/pixQrCode`,
      );
      if (String(pix.payload || '').trim()) return pix;
      lastError = new Error('Asaas Company pixQrCode vazio.');
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    if (attempt < maxAttempts) await sleep(400 * attempt);
  }
  throw lastError || new Error('Asaas Company pixQrCode indisponível.');
}

/**
 * GET /payments/{id}/identificationField — linha digitável, nosso número e código de barras oficiais.
 * A cobrança POST/GET sozinha frequentemente não traz identificationField completo.
 */
export async function asaasCompanyFetchIdentificationField(
  apiKey: string,
  environment: BankEnvironment,
  paymentId: string,
): Promise<AsaasCompanyIdentificationField> {
  const maxAttempts = 6;
  let lastError: Error | null = null;
  let last: AsaasCompanyIdentificationField = {};
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const data = await asaasCompanyFetch<AsaasCompanyIdentificationField>(
        apiKey,
        environment,
        `/payments/${encodeURIComponent(paymentId)}/identificationField`,
      );
      last = data || {};
      const digitable = String(data?.identificationField || '').replace(/\D/g, '');
      if (digitable.length === 47) return data;
      lastError = new Error('Asaas ainda não retornou linha digitável completa.');
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    if (attempt < maxAttempts) await sleep(450 * attempt);
  }
  if (String(last.identificationField || '').replace(/\D/g, '').length === 47) return last;
  throw lastError || new Error('Linha digitável Asaas indisponível.');
}

/**
 * GET /myAccount/commercialInfo — CPF/CNPJ e razão social oficiais da conta recebedora.
 * Não lança em falha transitória: retorna null para permitir fallback local.
 */
export async function asaasCompanyFetchCommercialInfo(
  apiKey: string,
  environment: BankEnvironment,
): Promise<AsaasCompanyCommercialInfo | null> {
  try {
    const data = await asaasCompanyFetch<AsaasCompanyCommercialInfo>(
      apiKey,
      environment,
      '/myAccount/commercialInfo',
    );
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch (err) {
    console.warn(
      '[asaasCompany] commercialInfo indisponível',
      err instanceof Error ? err.message : 'erro',
    );
    return null;
  }
}

function mergePaymentIdentification(
  payment: AsaasCompanyPayment,
  idField: AsaasCompanyIdentificationField | null,
): AsaasCompanyPayment {
  if (!idField) return payment;
  return {
    ...payment,
    identificationField:
      String(idField.identificationField || '').trim() || payment.identificationField,
    nossoNumero: String(idField.nossoNumero || '').trim() || payment.nossoNumero,
    barCode: String(idField.barCode || '').trim() || payment.barCode,
  };
}

async function asaasCompanyPollPaymentBoleto(
  apiKey: string,
  environment: BankEnvironment,
  paymentId: string,
): Promise<AsaasCompanyPayment> {
  const maxAttempts = 6;
  let last: AsaasCompanyPayment | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const payment = await asaasCompanyGetPayment(apiKey, environment, paymentId);
    last = payment;
    const hasBoleto =
      String(payment.bankSlipUrl || '').trim() ||
      String(payment.identificationField || '').trim() ||
      String(payment.invoiceUrl || '').trim();
    if (hasBoleto) return payment;
    if (attempt < maxAttempts) await sleep(500 * attempt);
  }
  return last || { id: paymentId };
}

export type AsaasCompanyCustomerInput = {
  name: string;
  cpfCnpj?: string;
  email?: string;
  externalReference?: string;
};

export async function asaasCompanyFindOrCreateCustomer(
  apiKey: string,
  environment: BankEnvironment,
  input: AsaasCompanyCustomerInput,
): Promise<string> {
  const doc = String(input.cpfCnpj || '').replace(/\D/g, '');
  if (doc) {
    const listed = await asaasCompanyFetch<{ data?: Array<{ id: string }> }>(
      apiKey,
      environment,
      `/customers?cpfCnpj=${encodeURIComponent(doc)}&limit=1`,
    );
    if (listed.data?.[0]?.id) return listed.data[0].id;
  }

  const created = await asaasCompanyFetch<{ id: string }>(apiKey, environment, '/customers', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name || 'Cliente SV LOTES',
      cpfCnpj: doc || undefined,
      email: input.email || undefined,
      externalReference: input.externalReference,
    }),
  });
  if (!created.id) throw new Error('Asaas Company não retornou customer id.');
  return created.id;
}

export type AsaasCompanyCreatePaymentInput = {
  customerId: string;
  billingType: AsaasCompanyCreateBillingType;
  value: number;
  dueDate: string;
  description: string;
  externalReference: string;
};

export async function asaasCompanyCreatePayment(
  apiKey: string,
  environment: BankEnvironment,
  input: AsaasCompanyCreatePaymentInput,
): Promise<{
  payment: AsaasCompanyPayment;
  pixQrCode: string;
  pixCopyPaste: string;
  bankSlipIdentification: string | null;
}> {
  const lateFees = buildCompanyAsaasLateFeePayload();

  const payment = await asaasCompanyFetch<AsaasCompanyPayment>(apiKey, environment, '/payments', {
    method: 'POST',
    body: JSON.stringify({
      customer: input.customerId,
      billingType: input.billingType,
      value: Number(input.value.toFixed(2)),
      dueDate: input.dueDate,
      description: input.description.slice(0, 500),
      externalReference: input.externalReference,
      fine: lateFees.fine,
      interest: lateFees.interest,
    }),
  });

  if (!payment.id) throw new Error('Asaas Company não retornou payment id.');

  let paymentFull =
    input.billingType === 'PIX'
      ? await asaasCompanyGetPayment(apiKey, environment, payment.id)
      : await asaasCompanyPollPaymentBoleto(apiKey, environment, payment.id);

  let pixQrCode = '';
  let pixCopyPaste = '';

  if (input.billingType === 'PIX') {
    const pix = await asaasCompanyFetchPixQrCode(apiKey, environment, payment.id);
    pixQrCode = normalizePixQrImage(pix.encodedImage);
    pixCopyPaste = String(pix.payload || '').trim();
    if (!pixCopyPaste) throw new Error('Asaas Company não retornou Pix copia e cola.');
  } else {
    try {
      const pix = await asaasCompanyFetchPixQrCode(apiKey, environment, payment.id);
      pixQrCode = normalizePixQrImage(pix.encodedImage);
      pixCopyPaste = String(pix.payload || '').trim();
    } catch {
      /* Pix opcional em cobranças com boleto — fatura Asaas pode oferecer QR */
    }
    const bankSlipUrl = String(paymentFull.bankSlipUrl || '').trim();
    const invoiceUrl = String(paymentFull.invoiceUrl || '').trim();
    if (!bankSlipUrl && !invoiceUrl) {
      throw new Error(
        'Asaas não retornou boleto/fatura. Verifique se a conta Asaas tem boleto habilitado.',
      );
    }
    try {
      const idField = await asaasCompanyFetchIdentificationField(
        apiKey,
        environment,
        payment.id,
      );
      paymentFull = mergePaymentIdentification(paymentFull, idField);
    } catch {
      /* linha digitável pode ficar pendente — enrich/carnê rebusca */
    }
  }

  const bankSlipIdentification = extractCompanyAsaasBankSlipIdentification(paymentFull);

  return { payment: paymentFull, pixQrCode, pixCopyPaste, bankSlipIdentification };
}

export async function asaasCompanyGetPayment(
  apiKey: string,
  environment: BankEnvironment,
  paymentId: string,
): Promise<AsaasCompanyPayment> {
  return asaasCompanyFetch<AsaasCompanyPayment>(
    apiKey,
    environment,
    `/payments/${encodeURIComponent(paymentId)}`,
  );
}

export async function asaasCompanyEnrichPaymentArtifacts(
  apiKey: string,
  environment: BankEnvironment,
  paymentId: string,
  options?: { billingType?: string | null; existingPixCopy?: string | null },
): Promise<{
  payment: AsaasCompanyPayment;
  pixQrCode: string;
  pixCopyPaste: string;
  bankSlipIdentification: string | null;
}> {
  let payment = await asaasCompanyGetPayment(apiKey, environment, paymentId);
  const billing = String(options?.billingType || payment.billingType || '').toUpperCase();

  if (billing !== 'PIX') {
    payment = await asaasCompanyPollPaymentBoleto(apiKey, environment, paymentId);
    try {
      const idField = await asaasCompanyFetchIdentificationField(
        apiKey,
        environment,
        paymentId,
      );
      payment = mergePaymentIdentification(payment, idField);
    } catch {
      /* mantém o que já existir no payment */
    }
  }

  let pixQrCode = '';
  let pixCopyPaste = String(options?.existingPixCopy || '').trim();

  if (billing === 'PIX' || !pixCopyPaste) {
    try {
      const pix = await asaasCompanyFetchPixQrCode(apiKey, environment, paymentId);
      pixQrCode = normalizePixQrImage(pix.encodedImage);
      pixCopyPaste = String(pix.payload || '').trim() || pixCopyPaste;
    } catch {
      /* mantém pix existente ou vazio */
    }
  }

  return {
    payment,
    pixQrCode,
    pixCopyPaste,
    bankSlipIdentification: extractCompanyAsaasBankSlipIdentification(payment),
  };
}

export async function asaasCompanyCancelPayment(
  apiKey: string,
  environment: BankEnvironment,
  paymentId: string,
): Promise<void> {
  await asaasCompanyFetch(apiKey, environment, `/payments/${encodeURIComponent(paymentId)}`, {
    method: 'DELETE',
  });
}

export type AsaasCompanyFinancialTransaction = {
  id?: string;
  value?: number;
  type?: string;
  date?: string;
  description?: string | null;
  paymentId?: string | null;
  transferId?: string | null;
};

type AsaasCompanyFinancialTransactionListResponse = {
  hasMore?: boolean;
  data?: AsaasCompanyFinancialTransaction[];
};

/** GET /financialTransactions — extrato da conta Asaas do tenant (paginado). */
export async function listAsaasCompanyFinancialTransactions(
  apiKey: string,
  environment: BankEnvironment,
  startDate: string,
  finishDate: string,
): Promise<AsaasCompanyFinancialTransaction[]> {
  const from = String(startDate || '').split('T')[0];
  const to = String(finishDate || '').split('T')[0];
  if (!from || !to) {
    throw new Error('Período inválido para consulta do extrato Asaas.');
  }

  const all: AsaasCompanyFinancialTransaction[] = [];
  let offset = 0;
  const limit = 100;

  for (let page = 0; page < 200; page += 1) {
    const params = new URLSearchParams({
      startDate: from,
      finishDate: to,
      limit: String(limit),
      offset: String(offset),
      order: 'asc',
    });
    const response = await asaasCompanyFetch<AsaasCompanyFinancialTransactionListResponse>(
      apiKey,
      environment,
      `/financialTransactions?${params.toString()}`,
    );
    const batch = response.data || [];
    all.push(...batch);
    if (!response.hasMore || batch.length < limit) break;
    offset += limit;
  }

  return all;
}
