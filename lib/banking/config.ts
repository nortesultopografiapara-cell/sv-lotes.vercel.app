/**
 * Feature flag do Módulo Bancário SV LOTES 2.0.
 * Desativado por padrão — ativar apenas em develop/preview quando pronto.
 */
export function isBankingModuleEnabled(): boolean {
  return process.env.BANKING_MODULE_ENABLED === 'true';
}

/**
 * Espelho para UI (client components). Manter igual a BANKING_MODULE_ENABLED.
 * Next.js só expõe variáveis NEXT_PUBLIC_* no bundle do browser.
 */
export function isBankingModuleEnabledForUi(): boolean {
  return process.env.NEXT_PUBLIC_BANKING_MODULE_ENABLED === 'true';
}

export const BANKING_MODULE_FLAG = 'BANKING_MODULE_ENABLED' as const;
export const BANKING_MODULE_UI_FLAG = 'NEXT_PUBLIC_BANKING_MODULE_ENABLED' as const;
