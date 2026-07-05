/**
 * Cliente HTTP Asaas **Company** — usa API Key do tenant.
 * Nunca usar credencial Master SaaS — apenas apiKey do tenant.
 */
import type { BankEnvironment } from '@/lib/banking/types';

export type AsaasCompanyPayment = {
  id?: string;
  status?: string;
  dueDate?: string;
  value?: number;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  identificationField?: string;
  paymentDate?: string;
  clientPaymentDate?: string;
  billingType?: string;
};

export type AsaasCompanyPixQrCode = {
  encodedImage?: string;
  payload?: string;
};

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
  billingType: 'PIX' | 'BOLETO';
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
}> {
  const payment = await asaasCompanyFetch<AsaasCompanyPayment>(apiKey, environment, '/payments', {
    method: 'POST',
    body: JSON.stringify({
      customer: input.customerId,
      billingType: input.billingType,
      value: Number(input.value.toFixed(2)),
      dueDate: input.dueDate,
      description: input.description.slice(0, 500),
      externalReference: input.externalReference,
    }),
  });

  if (!payment.id) throw new Error('Asaas Company não retornou payment id.');

  const paymentFull = await asaasCompanyFetch<AsaasCompanyPayment>(
    apiKey,
    environment,
    `/payments/${encodeURIComponent(payment.id)}`,
  );

  let pixQrCode = '';
  let pixCopyPaste = '';
  if (input.billingType === 'PIX') {
    const pix = await asaasCompanyFetchPixQrCode(apiKey, environment, payment.id);
    pixQrCode = normalizePixQrImage(pix.encodedImage);
    pixCopyPaste = String(pix.payload || '').trim();
    if (!pixCopyPaste) throw new Error('Asaas Company não retornou Pix copia e cola.');
  }

  return { payment: paymentFull, pixQrCode, pixCopyPaste };
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

export async function asaasCompanyCancelPayment(
  apiKey: string,
  environment: BankEnvironment,
  paymentId: string,
): Promise<void> {
  await asaasCompanyFetch(apiKey, environment, `/payments/${encodeURIComponent(paymentId)}`, {
    method: 'DELETE',
  });
}
