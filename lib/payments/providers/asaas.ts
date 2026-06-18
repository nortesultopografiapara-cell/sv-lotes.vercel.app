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
  paymentDate?: string;
  clientPaymentDate?: string;
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

    const pix = await asaasFetch<{ encodedImage?: string; payload?: string }>(
      `/payments/${payment.id}/pixQrCode`,
    );

    return {
      paymentId: payment.id,
      pixQrCode: pix.encodedImage
        ? pix.encodedImage.startsWith('data:')
          ? pix.encodedImage
          : `data:image/png;base64,${pix.encodedImage}`
        : '',
      pixCopyPaste: pix.payload || '',
      paymentUrl: payment.invoiceUrl || null,
      status: mapProviderStatusToChargeStatus(mapAsaasStatus(payment.status)),
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
