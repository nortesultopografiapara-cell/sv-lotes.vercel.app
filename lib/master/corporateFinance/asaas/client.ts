/**
 * Cliente HTTP Asaas — exclusivo Financeiro Corporativo MASTER.
 * Usa ASAAS_API_KEY / ASAAS_ENV (mesma conta SaaS), sem acoplar a saas_charges nem tenant.
 */
import {
  requireCorporateAsaasApiKey,
  resolveCorporateAsaasEnvironment,
} from './domain';
import { sanitizeCorporateAsaasErrorMessage } from './validation';

export type CorporateAsaasPaymentRemote = {
  id?: string;
  status?: string;
  billingType?: string;
  value?: number;
  netValue?: number;
  dueDate?: string;
  description?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  transactionReceiptUrl?: string;
  identificationField?: string;
  nossoNumero?: string;
  paymentDate?: string;
  clientPaymentDate?: string;
  confirmedDate?: string;
  externalReference?: string;
  customer?: string;
  deleted?: boolean;
};

export type CorporateAsaasPixQrRemote = {
  encodedImage?: string;
  payload?: string;
  expirationDate?: string;
};

function baseUrl(): string {
  const env = resolveCorporateAsaasEnvironment();
  return env === 'production'
    ? 'https://api.asaas.com/v3'
    : 'https://api-sandbox.asaas.com/v3';
}

function headers(): HeadersInit {
  const key = requireCorporateAsaasApiKey();
  return {
    'Content-Type': 'application/json',
    access_token: key,
    'User-Agent': 'SV-LOTES-Corporate-Finance/1.0',
  };
}

export async function corporateAsaasFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (json as { errors?: Array<{ description?: string }> })?.errors?.[0]?.description ||
      (json as { message?: string })?.message ||
      `Asaas HTTP ${res.status}`;
    throw new Error(sanitizeCorporateAsaasErrorMessage(msg));
  }
  return json as T;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function normalizeCorporatePixQrImage(encoded?: string | null): string | null {
  const raw = String(encoded || '').trim();
  if (!raw) return null;
  if (raw.startsWith('data:')) return raw;
  return `data:image/png;base64,${raw}`;
}

export async function corporateAsaasFindCustomerIdByCpfCnpj(
  cpfCnpj: string,
): Promise<string | null> {
  const doc = cpfCnpj.replace(/\D/g, '');
  if (!doc) return null;
  const listed = await corporateAsaasFetch<{ data?: Array<{ id: string }> }>(
    `/customers?cpfCnpj=${encodeURIComponent(doc)}&limit=1`,
  );
  return listed.data?.[0]?.id || null;
}

export async function corporateAsaasCreateCustomer(input: {
  name: string;
  cpfCnpj: string;
  email?: string | null;
  phone?: string | null;
  mobilePhone?: string | null;
  externalReference?: string;
}): Promise<string> {
  const created = await corporateAsaasFetch<{ id: string }>('/customers', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      cpfCnpj: input.cpfCnpj.replace(/\D/g, ''),
      email: input.email || undefined,
      phone: input.phone || undefined,
      mobilePhone: input.mobilePhone || undefined,
      externalReference: input.externalReference,
    }),
  });
  return created.id;
}

export async function corporateAsaasCreatePayment(input: {
  customer: string;
  billingType: 'PIX' | 'BOLETO';
  value: number;
  dueDate: string;
  description: string;
  externalReference: string;
  /** Metadata Asaas (chave/valor string). */
  metadata?: Record<string, string>;
}): Promise<CorporateAsaasPaymentRemote> {
  const body: Record<string, unknown> = {
    customer: input.customer,
    billingType: input.billingType,
    value: input.value,
    dueDate: input.dueDate,
    description: input.description,
    externalReference: input.externalReference,
  };
  if (input.metadata) {
    // Asaas aceita array { key, value } em alguns ambientes; enviamos também campos no description domain
    body.postalData = Object.entries(input.metadata).map(([key, value]) => ({
      key,
      value,
    }));
  }
  return corporateAsaasFetch<CorporateAsaasPaymentRemote>('/payments', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function corporateAsaasGetPayment(
  paymentId: string,
): Promise<CorporateAsaasPaymentRemote> {
  return corporateAsaasFetch<CorporateAsaasPaymentRemote>(
    `/payments/${encodeURIComponent(paymentId)}`,
  );
}

export async function corporateAsaasFetchPixQrCode(
  paymentId: string,
  options?: { maxAttempts?: number; delayMs?: number },
): Promise<CorporateAsaasPixQrRemote> {
  const maxAttempts = options?.maxAttempts ?? 5;
  const delayMs = options?.delayMs ?? 400;
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const pix = await corporateAsaasFetch<CorporateAsaasPixQrRemote>(
        `/payments/${encodeURIComponent(paymentId)}/pixQrCode`,
      );
      if (String(pix.payload || '').trim()) return pix;
      lastError = new Error('Asaas pixQrCode retornou payload vazio.');
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    if (attempt < maxAttempts) await sleep(delayMs * attempt);
  }
  throw lastError || new Error('Asaas pixQrCode indisponível.');
}

export async function corporateAsaasCancelPayment(
  paymentId: string,
): Promise<{ ok: boolean; httpStatus: number; message: string }> {
  const res = await fetch(
    `${baseUrl()}/payments/${encodeURIComponent(paymentId)}`,
    { method: 'DELETE', headers: headers() },
  );
  if (res.status === 404) {
    return { ok: true, httpStatus: 404, message: 'Cobrança não encontrada no Asaas.' };
  }
  const json = await res.json().catch(() => ({}));
  if (res.ok) {
    return { ok: true, httpStatus: res.status, message: 'Cancelada no Asaas.' };
  }
  const msg =
    (json as { errors?: Array<{ description?: string }> })?.errors?.[0]?.description ||
    (json as { message?: string })?.message ||
    `Asaas HTTP ${res.status}`;
  return {
    ok: false,
    httpStatus: res.status,
    message: sanitizeCorporateAsaasErrorMessage(msg),
  };
}

export function mapAsaasRemoteStatusToLocal(
  status?: string | null,
):
  | 'PENDING'
  | 'AWAITING_PAYMENT'
  | 'RECEIVED'
  | 'CONFIRMED'
  | 'OVERDUE'
  | 'CANCELLED'
  | 'REFUNDED' {
  const key = String(status || '').toUpperCase();
  if (key === 'CONFIRMED') return 'CONFIRMED';
  if (['RECEIVED', 'RECEIVED_IN_CASH'].includes(key)) return 'RECEIVED';
  if (key === 'OVERDUE') return 'OVERDUE';
  if (['REFUNDED', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE', 'AWAITING_CHARGEBACK_REVERSAL'].includes(key)) {
    return 'REFUNDED';
  }
  if (['DELETED', 'CANCELED', 'CANCELLED'].includes(key)) return 'CANCELLED';
  if (['PENDING', 'AWAITING_RISK_ANALYSIS'].includes(key)) return 'AWAITING_PAYMENT';
  return 'AWAITING_PAYMENT';
}
