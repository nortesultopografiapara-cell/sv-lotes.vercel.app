/**
 * Feature flag do Módulo Bancário SV LOTES 2.0.
 * Desativado por padrão — ativar apenas em develop/preview quando pronto.
 */
export function isBankingModuleEnabled(): boolean {
  return process.env.BANKING_MODULE_ENABLED === 'true';
}

export const BANKING_MODULE_FLAG = 'BANKING_MODULE_ENABLED' as const;
