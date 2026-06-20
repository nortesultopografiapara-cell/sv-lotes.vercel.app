/**
 * Configuração central do faturamento SaaS Master (cobrança de tenants).
 */

/** Dias após vencimento sem pagamento confirmado da competência para suspender empresa. */
export const SAAS_AUTO_SUSPEND_AFTER_DAYS = 10;

/**
 * Asaas não permite billingType PIX + BOLETO na mesma cobrança.
 * Use invoiceUrl da fatura Asaas para o cliente escolher a forma disponível,
 * ou gere cobranças separadas por billingType.
 */
export const ASAAS_SUPPORTS_COMBINED_PIX_BOLETO = false;

export type SaasMasterBillingType = 'PIX' | 'BOLETO';

export {
  DEFAULT_FINE_PERCENT,
  DEFAULT_INTEREST_PERCENT,
} from '@/lib/saasLateFeeConfig';
