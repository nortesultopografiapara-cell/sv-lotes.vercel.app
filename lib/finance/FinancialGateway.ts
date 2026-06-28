/**
 * Gateway financeiro unificado — ASAAS é o provider ativo oficial.
 * Demais integrações permanecem registradas para evolução futura.
 */

export const FINANCIAL_GATEWAY_PROVIDERS = [
  'ASAAS',
  'SICOOB',
  'SICREDI',
  'BANCO_DO_BRASIL',
  'CAIXA',
  'BRADESCO',
  'SANTANDER',
  'ITAU',
  'INTER',
  'NUBANK',
] as const;

export type FinancialGatewayProvider = (typeof FINANCIAL_GATEWAY_PROVIDERS)[number];

/** Providers com emissão/cobrança ativa nesta versão. */
export const ACTIVE_FINANCIAL_GATEWAY_PROVIDERS: FinancialGatewayProvider[] = ['ASAAS'];

export function getPrimaryFinancialGateway(): FinancialGatewayProvider {
  return 'ASAAS';
}

export function isFinancialGatewayProviderActive(code: FinancialGatewayProvider): boolean {
  return ACTIVE_FINANCIAL_GATEWAY_PROVIDERS.includes(code);
}

export function listFinancialGatewayProviders(): {
  code: FinancialGatewayProvider;
  label: string;
  active: boolean;
}[] {
  const labels: Record<FinancialGatewayProvider, string> = {
    ASAAS: 'Asaas',
    SICOOB: 'Sicoob',
    SICREDI: 'Sicredi',
    BANCO_DO_BRASIL: 'Banco do Brasil',
    CAIXA: 'Caixa',
    BRADESCO: 'Bradesco',
    SANTANDER: 'Santander',
    ITAU: 'Itaú',
    INTER: 'Inter',
    NUBANK: 'Nubank',
  };

  return FINANCIAL_GATEWAY_PROVIDERS.map((code) => ({
    code,
    label: labels[code],
    active: isFinancialGatewayProviderActive(code),
  }));
}
