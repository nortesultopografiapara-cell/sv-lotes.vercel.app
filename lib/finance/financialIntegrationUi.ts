import {
  FINANCIAL_GATEWAY_PROVIDERS,
  type FinancialGatewayProvider,
} from '@/lib/finance/FinancialGateway';

export type FinancialIntegrationUiCardStatus = 'principal' | 'development';

export type FinancialIntegrationUiCard = {
  code: FinancialGatewayProvider;
  label: string;
  status: FinancialIntegrationUiCardStatus;
  description: string;
};

/**
 * Cards exibidos em Configurações → Integração Financeira.
 * Apenas configuração visual — providers ocultos permanecem em FinancialGateway.
 */
export const FINANCIAL_INTEGRATION_UI_CARDS: FinancialIntegrationUiCard[] = [
  {
    code: 'ASAAS',
    label: 'Asaas',
    status: 'principal',
    description: 'Gateway oficial de cobrança e recebimentos.',
  },
  {
    code: 'INTER',
    label: 'Inter',
    status: 'development',
    description: 'Configuração de credenciais disponível (Fase A).',
  },
  {
    code: 'C6',
    label: 'C6 Bank',
    status: 'development',
    description: 'Credenciais locais em homologação. Emissão ainda não disponível.',
  },
  {
    code: 'NUBANK',
    label: 'Nubank',
    status: 'development',
    description: 'Integração direta em preparação.',
  },
  {
    code: 'CORA',
    label: 'Cora',
    status: 'development',
    description: 'Integração direta em preparação.',
  },
];

const VISIBLE_UI_CODES = new Set(
  FINANCIAL_INTEGRATION_UI_CARDS.map((card) => card.code),
);

/** Bancos nativos visíveis na aba "Em desenvolvimento" (exclui Asaas — aba própria). */
export const FINANCIAL_INTEGRATION_VISIBLE_BANK_CODES: FinancialGatewayProvider[] =
  FINANCIAL_INTEGRATION_UI_CARDS.filter((card) => card.status === 'development').map(
    (card) => card.code,
  );

export function listFinancialIntegrationUiCards(): FinancialIntegrationUiCard[] {
  return [...FINANCIAL_INTEGRATION_UI_CARDS];
}

export function listFinancialIntegrationVisibleBanks(): FinancialGatewayProvider[] {
  return [...FINANCIAL_INTEGRATION_VISIBLE_BANK_CODES];
}

/** Providers registrados no gateway, ocultos nesta versão da UI (reutilizáveis no futuro). */
export function listFinancialIntegrationHiddenBankCodes(): FinancialGatewayProvider[] {
  return FINANCIAL_GATEWAY_PROVIDERS.filter((code) => !VISIBLE_UI_CODES.has(code));
}

export function isFinancialIntegrationUiVisible(code: FinancialGatewayProvider): boolean {
  return VISIBLE_UI_CODES.has(code);
}
