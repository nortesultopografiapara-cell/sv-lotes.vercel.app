import type { IBankProvider, BankProviderContext } from '../BankProvider';
import type {
  BankBoletoPayload,
  BankCharge,
  BankChargeStatus,
  BankConnectionTestResult,
  BankPixPayload,
  BankReconcileResult,
  BankWebhookEvent,
  BankWebhookParseResult,
  CreateBankBoletoInput,
  CreateBankPixInput,
} from '../types';
import {
  buildWebhookIdempotencyKey,
  claimWebhookEvent,
} from '../webhookIdempotency';

const mockCharges = new Map<string, BankCharge>();

export const MOCK_BOLETO_PAY_PATH_PREFIX = '/banking/mock/pay';
export const MOCK_PIX_PAY_PATH_PREFIX = '/banking/mock/pix';

export function buildMockBoletoPaymentPath(externalId: string): string {
  return `${MOCK_BOLETO_PAY_PATH_PREFIX}/${encodeURIComponent(externalId)}`;
}

export function buildMockPixPaymentPath(externalId: string): string {
  return `${MOCK_PIX_PAY_PATH_PREFIX}/${encodeURIComponent(externalId)}`;
}

export type MockChargeDisplay = {
  externalId: string;
  chargeType: 'BOLETO' | 'PIX';
  status: 'PENDING';
  amount: number;
  dueDate: string;
  environment: 'SANDBOX';
  digitableLine?: string;
  barcode?: string;
  pixCopyPaste?: string;
  pixQrCode?: string;
};

export function isMockBoletoExternalId(externalId: string): boolean {
  return externalId.startsWith('mock_boleto_');
}

export function isMockPixExternalId(externalId: string): boolean {
  return externalId.startsWith('mock_pix_');
}

/** Dados de exibição MOCK — memória do provider ou síntese fictícia pelo ID. */
export function getMockChargeDisplay(
  externalId: string,
  chargeType: 'BOLETO' | 'PIX',
): MockChargeDisplay {
  const stored = mockCharges.get(externalId);
  if (stored) {
    return {
      externalId,
      chargeType: stored.chargeType,
      status: 'PENDING',
      amount: stored.amount,
      dueDate: stored.dueDate,
      environment: 'SANDBOX',
      digitableLine: stored.digitableLine ?? undefined,
      barcode: stored.barcode ?? undefined,
      pixCopyPaste: stored.pixCopyPaste ?? undefined,
      pixQrCode: stored.pixQrCode ?? undefined,
    };
  }

  const amount = 0;
  const dueDate = new Date().toISOString().slice(0, 10);
  if (chargeType === 'BOLETO') {
    const digitableLine = buildDigitableLine(1, dueDate);
    return {
      externalId,
      chargeType,
      status: 'PENDING',
      amount,
      dueDate,
      environment: 'SANDBOX',
      digitableLine,
      barcode: buildBarcode(digitableLine),
    };
  }

  const pixCopyPaste = buildPixCopyPaste(externalId, 1);
  return {
    externalId,
    chargeType,
    status: 'PENDING',
    amount,
    dueDate,
    environment: 'SANDBOX',
    pixCopyPaste,
    pixQrCode: buildPixQrSvg(pixCopyPaste),
  };
}

function mockExternalId(prefix: string, key: string): string {
  return `mock_${prefix}_${key.slice(0, 8)}_${Date.now()}`;
}

function buildDigitableLine(amount: number, dueDate: string): string {
  const cents = Math.round(amount * 100)
    .toString()
    .padStart(10, '0');
  const due = dueDate.replace(/-/g, '').slice(2);
  return `75691.23405 01234.567890 12345.678901 1 ${due}${cents}`;
}

function buildBarcode(digitableLine: string): string {
  return digitableLine.replace(/\D/g, '').padStart(44, '0').slice(0, 44);
}

function buildPixCopyPaste(externalId: string, amount: number): string {
  return `00020126580014BR.GOV.BCB.PIX0136${externalId}520400005303986540${amount.toFixed(2)}5802BR5925SV LOTES MOCK6009PARAUAPEBAS62070503***6304MOCK`;
}

function buildPixQrSvg(copyPaste: string): string {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#fff"/><text x="8" y="80" font-size="10" fill="#111">PIX MOCK</text><text x="8" y="100" font-size="8" fill="#666">${copyPaste.slice(0, 24)}…</text></svg>`,
  )}`;
}

function storeCharge(charge: BankCharge): BankCharge {
  mockCharges.set(charge.externalId || charge.id, charge);
  return charge;
}

export function clearMockBankProviderStateForTests(): void {
  mockCharges.clear();
}

/** Provider MOCK — simula boleto/Pix sem banco real. */
export class MockBankProvider implements IBankProvider {
  readonly providerCode = 'MOCK' as const;

  async testConnection(_context: BankProviderContext): Promise<BankConnectionTestResult> {
    return {
      ok: true,
      message: 'Conexão MOCK simulada com sucesso.',
      latencyMs: 12,
    };
  }

  async createBoleto(
    input: CreateBankBoletoInput,
    context: BankProviderContext,
  ): Promise<BankBoletoPayload> {
    const externalId = mockExternalId('boleto', input.idempotencyKey);
    const ourNumber = `${Date.now()}`.slice(-8);
    const digitableLine = buildDigitableLine(input.amount, input.dueDate);
    const barcode = buildBarcode(digitableLine);
    const paymentUrl = buildMockBoletoPaymentPath(externalId);

    const charge: BankCharge = {
      id: externalId,
      companyId: input.companyId,
      integrationId: input.integrationId,
      financeReceiptId: input.financeReceiptId,
      chargeType: 'BOLETO',
      provider: this.providerCode,
      environment: context.environment,
      externalId,
      amount: input.amount,
      dueDate: input.dueDate,
      status: 'PENDING',
      barcode,
      digitableLine,
      paymentUrl,
      pdfUrl: paymentUrl,
      idempotencyKey: input.idempotencyKey,
    };
    storeCharge(charge);

    return {
      externalId,
      ourNumber,
      barcode,
      digitableLine,
      paymentUrl,
      pdfUrl: charge.pdfUrl,
      status: 'PENDING',
    };
  }

  async createPix(input: CreateBankPixInput, context: BankProviderContext): Promise<BankPixPayload> {
    const externalId = mockExternalId('pix', input.idempotencyKey);
    const txid = externalId.replace(/^mock_/, '').slice(0, 32);
    const pixCopyPaste = buildPixCopyPaste(externalId, input.amount);
    const pixQrCode = buildPixQrSvg(pixCopyPaste);
    const paymentUrl = buildMockPixPaymentPath(externalId);

    const charge: BankCharge = {
      id: externalId,
      companyId: input.companyId,
      integrationId: input.integrationId,
      financeReceiptId: input.financeReceiptId,
      chargeType: 'PIX',
      provider: this.providerCode,
      environment: context.environment,
      externalId,
      amount: input.amount,
      dueDate: input.dueDate,
      status: 'PENDING',
      pixQrCode,
      pixCopyPaste,
      paymentUrl,
      idempotencyKey: input.idempotencyKey,
    };
    storeCharge(charge);

    return {
      externalId,
      txid,
      pixQrCode,
      pixCopyPaste,
      paymentUrl,
      status: 'PENDING',
    };
  }

  async getCharge(externalId: string, _context: BankProviderContext): Promise<BankCharge | null> {
    return mockCharges.get(externalId) ?? null;
  }

  async cancelCharge(externalId: string, _context: BankProviderContext): Promise<BankCharge> {
    const existing = mockCharges.get(externalId);
    if (!existing) {
      throw new Error(`Cobrança MOCK não encontrada: ${externalId}`);
    }
    const cancelled: BankCharge = { ...existing, status: 'CANCELLED' };
    storeCharge(cancelled);
    return cancelled;
  }

  parseWebhook(
    payload: unknown,
    context: BankProviderContext,
    _headers?: Record<string, string>,
  ): BankWebhookParseResult {
    const body =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const externalEventId = String(body.eventId || body.id || `evt_${Date.now()}`);
    const idempotencyKey = buildWebhookIdempotencyKey(this.providerCode, externalEventId);

    if (!claimWebhookEvent(idempotencyKey)) {
      return {
        event: {
          id: idempotencyKey,
          companyId: context.companyId,
          integrationId: context.integrationId,
          provider: this.providerCode,
          eventType: String(body.eventType || 'payment.confirmed'),
          externalEventId,
          payload: body,
          processingStatus: 'DUPLICATE',
          idempotencyKey,
          signatureValid: true,
        },
        duplicate: true,
      };
    }

    const event: BankWebhookEvent = {
      id: idempotencyKey,
      companyId: context.companyId,
      integrationId: context.integrationId,
      provider: this.providerCode,
      eventType: String(body.eventType || 'payment.confirmed'),
      externalEventId,
      payload: body,
      processingStatus: 'PENDING',
      idempotencyKey,
      signatureValid: true,
    };

    return { event, duplicate: false };
  }

  reconcilePayment(event: BankWebhookEvent, charge: BankCharge): BankReconcileResult {
    const paidAmount = Number(event.payload.paidAmount ?? charge.amount);
    const paidAt = String(event.payload.paidAt ?? new Date().toISOString());
    const feeAmount = Number(event.payload.feeAmount ?? 0);
    const newStatus: BankChargeStatus = 'PAID';

    if (charge.externalId) {
      storeCharge({ ...charge, status: newStatus, paidAmount, paidAt });
    }

    return {
      chargeId: charge.id,
      financeReceiptId: charge.financeReceiptId || '',
      previousStatus: charge.status,
      newStatus,
      paidAmount,
      paidAt,
      cashMovement: {
        type: 'entrada',
        category: 'parcela',
        amount: paidAmount,
        description: `Recebimento MOCK parcela via ${event.eventType}`,
      },
      feeMovement:
        feeAmount > 0
          ? {
              type: 'saida',
              category: 'tarifa_bancaria',
              amount: feeAmount,
              description: 'Tarifa bancária MOCK',
            }
          : null,
    };
  }
}

export const mockBankProvider = new MockBankProvider();
