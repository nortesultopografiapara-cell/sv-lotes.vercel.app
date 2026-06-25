import type { IBankProvider } from './BankProvider';
import type { BankProvider } from './types';
import { mockBankProvider } from './providers/mockBankProvider';

const registry: Partial<Record<BankProvider, IBankProvider>> = {
  MOCK: mockBankProvider,
};

export function getBankProvider(code: BankProvider): IBankProvider | null {
  return registry[code] ?? null;
}

export function registerBankProvider(code: BankProvider, provider: IBankProvider): void {
  registry[code] = provider;
}

export { mockBankProvider };
