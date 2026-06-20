import type {
  ChargeStatusProviderResult,
  CreatePixChargeInput,
  PaymentDeleteResult,
  PaymentProvider,
  PixChargeProviderResult,
} from './types';
import { mapProviderStatusToChargeStatus, normalizeSaasBillingType } from './types';

type AsaasPayment = {
  id?: string;
  status?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  identificationField?: string;
  nossoNumero?: string;
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

function isBlockingAsaasDeleteError(status: number, message: string): boolean {
  if (status === 404) return false;
  if (status >= 200 && status < 300) return false;
  const msg = message.toLowerCase();
  if (
    msg.includes('paga') ||
    msg.includes('paid') ||
    msg.includes('received') ||
    msg.includes('confirmad') ||
    msg.includes('recebida') ||
    msg.includes('não pode ser exclu') ||
    msg.includes('nao pode ser exclu') ||
    msg.includes('cannot be deleted') ||
    msg.includes('not allowed')
  ) {
    return true;
  }
  return status === 400 || status === 403 || status === 409;
}

/** DELETE /payments/{id} com resultado estruturado para soft delete local. */
export async function deleteAsaasPayment(paymentId: string): Promise<PaymentDeleteResult> {
  const id = String(paymentId || '').trim();
  if (!id) {
    return {
      ok: true,
      httpStatus: 0,
      blocking: false,
      status: 'skipped',
      message: 'Sem payment_id',
    };
  }

  try {
    const res = await fetch(`${asaasBaseUrl()}/payments/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: asaasHeaders(),
    });
    if (res.status === 404) {
      return {
        ok: true,
        httpStatus: 404,
        blocking: false,
        status: 'not_found',
        message: 'Cobrança não encontrada no Asaas (404)',
      };
    }
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      return {
        ok: true,
        httpStatus: res.status,
        blocking: false,
        status: 'deleted',
        message: 'Excluída no Asaas',
      };
    }
    const msg =
      (json as { errors?: Array<{ description?: string }> })?.errors?.[0]?.description ||
      (json as { message?: string })?.message ||
      `Asaas HTTP ${res.status}`;
    const blocking = isBlockingAsaasDeleteError(res.status, msg);
    return {
      ok: false,
      httpStatus: res.status,
      blocking,
      status: blocking ? 'blocked' : 'error',
      message: msg,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      httpStatus: 0,
      blocking: true,
      status: 'error',
      message: msg,
    };
  }
}

function normalizePixQrImage(encodedImage?: string | null): string {
  const raw = String(encodedImage || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:')) return raw;
  return `data:image/png;base64,${raw}`;
}

function mapAsaasStatus(status?: string): ChargeStatusProviderResult['status'] {
  const key = String(status || '').toUpperCase();
  if (['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(key)) return 'PAID';
  if (['OVERDUE'].includes(key)) return 'OVERDUE';
  if (['CANCELED', 'DELETED', 'REFUNDED'].includes(key)) return 'CANCELLED';
  return 'PENDING';
}

function extractBankSlipIdentification(payment: AsaasPayment): string | null {
  const idField = String(payment.identificationField || '').trim();
  if (idField) return idField;
  const nosso = String(payment.nossoNumero || '').trim();
  return nosso || null;
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
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  bankSlipIdentification: string | null;
  status: PixChargeProviderResult['status'];
}> {
  const payment = await asaasFetch<AsaasPayment>(`/payments/${paymentId}`);
  const billingType = normalizeSaasBillingType(
    payment.bankSlipUrl && !payment.invoiceUrl ? 'BOLETO' : 'PIX',
  );

  let pixQrCode = '';
  let pixCopyPaste = '';
  if (billingType === 'PIX') {
    try {
      const pix = await fetchAsaasPixQrCode(paymentId);
      pixQrCode = normalizePixQrImage(pix.encodedImage);
      pixCopyPaste = String(pix.payload || '').trim();
    } catch {
      /* boleto-only ou QR ainda indisponível */
    }
  }

  return {
    paymentId,
    pixQrCode,
    pixCopyPaste,
    paymentUrl: payment.invoiceUrl || payment.bankSlipUrl || null,
    invoiceUrl: payment.invoiceUrl || null,
    bankSlipUrl: payment.bankSlipUrl || null,
    bankSlipIdentification: extractBankSlipIdentification(payment),
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

/** Provider Asaas — PIX e Boleto via API v3 (billingType mutuamente exclusivo). */
export class AsaasPaymentProvider implements PaymentProvider {
  readonly providerName = 'asaas';

  async createPixCharge(input: CreatePixChargeInput): Promise<PixChargeProviderResult> {
    const billingType = normalizeSaasBillingType(input.billingType);
    const customerId = await findOrCreateCustomer(input);

    const payment = await asaasFetch<AsaasPayment>('/payments', {
      method: 'POST',
      body: JSON.stringify({
        customer: customerId,
        billingType: billingType === 'BOLETO' ? 'BOLETO' : 'PIX',
        value: Number(input.amount.toFixed(2)),
        dueDate: input.dueDate,
        description: input.description.slice(0, 500),
        externalReference: input.chargeId,
      }),
    });

    if (!payment.id) throw new Error('Asaas não retornou ID da cobrança.');

    const paymentFull = await asaasFetch<AsaasPayment>(`/payments/${payment.id}`);
    const invoiceUrl = paymentFull.invoiceUrl || payment.invoiceUrl || null;
    const bankSlipUrl = paymentFull.bankSlipUrl || payment.bankSlipUrl || null;
    const bankSlipIdentification = extractBankSlipIdentification(paymentFull);

    if (billingType === 'BOLETO') {
      if (!bankSlipUrl && !invoiceUrl) {
        throw new Error('Asaas não retornou URL do boleto/fatura.');
      }
      return {
        paymentId: payment.id,
        pixQrCode: '',
        pixCopyPaste: '',
        paymentUrl: invoiceUrl || bankSlipUrl,
        invoiceUrl,
        bankSlipUrl,
        bankSlipIdentification,
        billingType: 'BOLETO',
        status: mapProviderStatusToChargeStatus(mapAsaasStatus(paymentFull.status || payment.status)),
        provider: this.providerName,
      };
    }

    const pix = await fetchAsaasPixQrCode(payment.id);
    const pixCopyPaste = String(pix.payload || '').trim();

    if (!pixCopyPaste) {
      throw new Error('Asaas não retornou código Pix Copia e Cola para a cobrança.');
    }

    return {
      paymentId: payment.id,
      pixQrCode: normalizePixQrImage(pix.encodedImage),
      pixCopyPaste,
      paymentUrl: invoiceUrl || bankSlipUrl,
      invoiceUrl,
      bankSlipUrl,
      bankSlipIdentification,
      billingType: 'PIX',
      status: mapProviderStatusToChargeStatus(mapAsaasStatus(paymentFull.status || payment.status)),
      provider: this.providerName,
    };
  }

  async getChargeStatus(paymentId: string): Promise<ChargeStatusProviderResult> {
    const payment = await asaasFetch<AsaasPayment>(`/payments/${paymentId}`);
    const status = mapAsaasStatus(payment.status);
    const paidAt = payment.paymentDate || payment.clientPaymentDate || null;
    return {
      paymentId,
      status,
      paidAt,
      invoiceUrl: payment.invoiceUrl || null,
      bankSlipUrl: payment.bankSlipUrl || null,
    };
  }

  async cancelCharge(paymentId: string): Promise<void> {
    await asaasFetch(`/payments/${paymentId}`, { method: 'DELETE' });
  }

  async deleteCharge(paymentId: string): Promise<PaymentDeleteResult> {
    return deleteAsaasPayment(paymentId);
  }
}

export function isAsaasConfigured(): boolean {
  return !!process.env.ASAAS_API_KEY?.trim();
}
