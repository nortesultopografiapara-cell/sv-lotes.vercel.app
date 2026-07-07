import type { FinancialGatewayProvider } from '@/lib/finance/FinancialGateway';

/**
 * Bancos exibidos em Configurações → Integração Financeira (aba "Em desenvolvimento").
 * Apenas visibilidade na UI — providers ocultos permanecem em FinancialGateway para evolução futura.
 */
export const FINANCIAL_INTEGRATION_VISIBLE_BANK_CODES: FinancialGatewayProvider[] = [
  'INTER',
  'NUBANK',
  'CORA',
];

export function listFinancialIntegrationVisibleBanks(): FinancialGatewayProvider[] {
  return [...FINANCIAL_INTEGRATION_VISIBLE_BANK_CODES];
}
