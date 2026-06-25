import type { BankProviderContext } from './BankProvider';
import { mockBankProvider } from './providers/mockBankProvider';
import type { BankIntegrationStatus } from './types';

export const MOCK_BANKING_PROVIDER = 'MOCK' as const;
export const MOCK_BANKING_ENVIRONMENT = 'SANDBOX' as const;
export const MOCK_INTEGRATION_STATUS: BankIntegrationStatus = 'DRAFT';

const MOCK_RECEIPT_PLACEHOLDER = '00000000-0000-4000-8000-000000000001';

function addDaysIso(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function buildMockBankProviderContext(companyId: string): BankProviderContext {
  const suffix = companyId.replace(/-/g, '').slice(0, 12).padStart(12, '0');
  return {
    companyId,
    integrationId: `00000000-0000-4000-a000-${suffix}`,
    environment: MOCK_BANKING_ENVIRONMENT,
  };
}

export type MockBankingMeta = {
  provider: typeof MOCK_BANKING_PROVIDER;
  environment: typeof MOCK_BANKING_ENVIRONMENT;
  integrationStatus: BankIntegrationStatus;
};

export async function runMockTestConnection(companyId: string) {
  const context = buildMockBankProviderContext(companyId);
  const connection = await mockBankProvider.testConnection(context);
  return {
    provider: MOCK_BANKING_PROVIDER,
    environment: MOCK_BANKING_ENVIRONMENT,
    integrationStatus: MOCK_INTEGRATION_STATUS,
    connection,
  } satisfies MockBankingMeta & { connection: Awaited<ReturnType<typeof mockBankProvider.testConnection>> };
}

export type MockCreateChargeInput = {
  amount?: number;
  dueDate?: string;
  payerName?: string;
};

export async function runMockCreateBoleto(companyId: string, input: MockCreateChargeInput = {}) {
  const context = buildMockBankProviderContext(companyId);
  const amount = typeof input.amount === 'number' && input.amount > 0 ? input.amount : 1500;
  const dueDate = input.dueDate || addDaysIso(30);
  const idempotencyKey = `mock-boleto-${companyId}-${Date.now()}`;

  const charge = await mockBankProvider.createBoleto(
    {
      companyId,
      integrationId: context.integrationId,
      financeReceiptId: MOCK_RECEIPT_PLACEHOLDER,
      amount,
      dueDate,
      payerName: input.payerName || 'Cliente MOCK SV LOTES',
      idempotencyKey,
    },
    context,
  );

  return {
    provider: MOCK_BANKING_PROVIDER,
    environment: MOCK_BANKING_ENVIRONMENT,
    integrationStatus: MOCK_INTEGRATION_STATUS,
    charge,
  };
}

export async function runMockCreatePix(companyId: string, input: MockCreateChargeInput = {}) {
  const context = buildMockBankProviderContext(companyId);
  const amount = typeof input.amount === 'number' && input.amount > 0 ? input.amount : 890;
  const dueDate = input.dueDate || addDaysIso(15);
  const idempotencyKey = `mock-pix-${companyId}-${Date.now()}`;

  const charge = await mockBankProvider.createPix(
    {
      companyId,
      integrationId: context.integrationId,
      financeReceiptId: MOCK_RECEIPT_PLACEHOLDER,
      amount,
      dueDate,
      payerName: input.payerName || 'Cliente MOCK SV LOTES',
      idempotencyKey,
    },
    context,
  );

  return {
    provider: MOCK_BANKING_PROVIDER,
    environment: MOCK_BANKING_ENVIRONMENT,
    integrationStatus: MOCK_INTEGRATION_STATUS,
    charge,
  };
}
