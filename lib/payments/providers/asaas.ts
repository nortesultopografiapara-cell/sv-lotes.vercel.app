import type {
  ChargeStatusProviderResult,
  CreatePixChargeInput,
  PaymentProvider,
  PixChargeProviderResult,
} from './types';
import { mapProviderStatusToChargeStatus } from './types';

type AsaasPayment = {
  id?: string;
  status?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  paymentDate?: string;
  clientPaymentDate?: string;
};

type AsaasPixQrCode = {
  encodedImage?: string;
  payload?: string;
  expirationDate?: string;
};

function asaasBaseUrl(): string {
  const env = String(process.env.ASAAS_ENV || 'sandbox').trim().toLowerCase();
  return env === 'production' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3';
}

function asaasHeaders(): HeadersInit {
  const key = process.env.ASAAS_API_KEY?.trim();
  if (!key) throw new Error('ASAAS_API_KEY não configurada.');
  return {
    'Content-Type': 'application/json',
    access_token: key,
    'User-Agent': 'SV-LOTES/1.0',
  };
}

async function asaasFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${asaasBaseUrl()}${path}`, {
    ...init,
    headers: { ...asaasHeaders(), ...(init?.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (json as { errors?: Array<{ description?: string }> })?.errors?.[0]?.description ||
      (json as { message?: string })?.message ||
      `Asaas HTTP ${res.status}`;
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

/** GET /payments/{id}/pixQrCode com retry — QR dinâmico pode demorar após POST. */
export async function fetchAsaasPixQrCode(
  paymentId: string,
  options?: { maxAttempts?: number; delayMs?: number },
): Promise<AsaasPixQrCode> {
  const maxAttempts = options?.maxAttempts ?? 5;
  const delayMs = options?.delayMs ?? 400;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const pix = await asaasFetch<AsaasPixQrCode>(`/payments/${paymentId}/pixQrCode`);
      if (String(pix.payload || '').trim()) return pix;
      lastError = new Error('Asaas pixQrCode retornou payload vazio.');
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    if (attempt < maxAttempts) {
      await sleep(delayMs * attempt);
    }
  }

  throw lastError || new Error('Asaas pixQrCode indisponível após tentativas.');
}

/** Recupera invoiceUrl e dados PIX de cobrança existente no Asaas. */
export async function fetchAsaasPaymentPixData(paymentId: string): Promise<{
  paymentId: string;
  pixQrCode: string;
  pixCopyPaste: string;
  paymentUrl: string | null;
  status: PixChargeProviderResult['status'];
}> {
  const payment = await asaasFetch<AsaasPayment>(`/payments/${paymentId}`);
  const pix = await fetchAsaasPixQrCode(paymentId);

  return {
    paymentId,
    pixQrCode: normalizePixQrImage(pix.encodedImage),
    pixCopyPaste: String(pix.payload || '').trim(),
    paymentUrl: payment.invoiceUrl || payment.bankSlipUrl || null,
    status: mapProviderStatusToChargeStatus(mapAsaasStatus(payment.status)),
  };
}

async function findOrCreateCustomer(input: CreatePixChargeInput): Promise<string> {
  const doc = (input.payerDocument || '').replace(/\D/g, '');
  if (doc) {
    const listed = await asaasFetch<{ data?: Array<{ id: string }> }>(
      `/customers?cpfCnpj=${encodeURIComponent(doc)}&limit=1`,
    );
    if (listed.data?.[0]?.id) return listed.data[0].id;
  }

  const created = await asaasFetch<{ id: string }>('/customers', {
    method: 'POST',
    body: JSON.stringify({
      name: input.payerName || 'Cliente SV LOTES',
      cpfCnpj: doc || undefined,
      email: input.payerEmail || undefined,
      externalReference: input.companyId,
    }),
  });
  return created.id;
}

function mapAsaasStatus(status?: string): ChargeStatusProviderResult['status'] {
  const key = String(status || '').toUpperCase();
  if (['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(key)) return 'PAID';
  if (['OVERDUE'].includes(key)) return 'OVERDUE';
  if (['CANCELED', 'DELETED', 'REFUNDED'].includes(key)) return 'CANCELLED';
  return 'PENDING';
}

/** Provider Asaas — PIX real via API v3. */
export class AsaasPaymentProvider implements PaymentProvider {
  readonly providerName = 'asaas';

  async createPixCharge(input: CreatePixChargeInput): Promise<PixChargeProviderResult> {
    const customerId = await findOrCreateCustomer(input);

    const payment = await asaasFetch<AsaasPayment>('/payments', {
      method: 'POST',
      body: JSON.stringify({
        customer: customerId,
        billingType: 'PIX',
        value: Number(input.amount.toFixed(2)),
        dueDate: input.dueDate,
        description: input.description.slice(0, 500),
        externalReference: input.chargeId,
      }),
    });

    if (!payment.id) throw new Error('Asaas não retornou ID da cobrança.');

    const paymentFull = await asaasFetch<AsaasPayment>(`/payments/${payment.id}`);
    const pix = await fetchAsaasPixQrCode(payment.id);
    const pixCopyPaste = String(pix.payload || '').trim();

    if (!pixCopyPaste) {
      throw new Error('Asaas não retornou código Pix Copia e Cola para a cobrança.');
    }

    return {
      paymentId: payment.id,
      pixQrCode: normalizePixQrImage(pix.encodedImage),
      pixCopyPaste,
      paymentUrl: paymentFull.invoiceUrl || paymentFull.bankSlipUrl || payment.invoiceUrl || null,
      status: mapProviderStatusToChargeStatus(mapAsaasStatus(paymentFull.status || payment.status)),
      provider: this.providerName,
    };
  }

  async getChargeStatus(paymentId: string): Promise<ChargeStatusProviderResult> {
    const payment = await asaasFetch<AsaasPayment>(`/payments/${paymentId}`);
    const status = mapAsaasStatus(payment.status);
    const paidAt = payment.paymentDate || payment.clientPaymentDate || null;
    return { paymentId, status, paidAt };
  }

  async cancelCharge(paymentId: string): Promise<void> {
    await asaasFetch(`/payments/${paymentId}`, { method: 'DELETE' });
  }
}

export function isAsaasConfigured(): boolean {
  return !!process.env.ASAAS_API_KEY?.trim();
}
