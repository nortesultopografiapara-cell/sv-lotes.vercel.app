/**
 * Feature flag do Módulo Bancário SV LOTES 2.0.
 * Desativado por padrão — ativar apenas em develop/preview quando pronto.
 *
 * UI: NEXT_PUBLIC_BANKING_MODULE_ENABLED (obrigatório no client).
 * API/server: BANKING_MODULE_ENABLED (runtime, nunca exposto ao browser).
 *
 * Em RSC (app/settings/page.tsx), resolveBankingUiEnabled() lê NEXT_PUBLIC
 * em request time — confiável no Preview Vercel sem depender só do bundle client.
 */

export const BANKING_MODULE_FLAG = 'BANKING_MODULE_ENABLED' as const;
export const BANKING_MODULE_UI_FLAG = 'NEXT_PUBLIC_BANKING_MODULE_ENABLED' as const;

/** Aceita apenas a string literal "true" (case-insensitive, trim). */
export function parseBankingEnvFlag(value: string | undefined | null): boolean {
  return String(value ?? '').trim().toLowerCase() === 'true';
}

function readPublicBankingEnvRaw(): string | undefined {
  // Acesso por chave dinâmica — evita constant folding agressivo no bundle client.
  const envKey = BANKING_MODULE_UI_FLAG;
  return process.env[envKey];
}

/** Valor bruto de NEXT_PUBLIC (diagnóstico). */
export function getPublicBankingFlagRaw(): string {
  const raw = readPublicBankingEnvRaw();
  return raw === undefined ? '(undefined)' : raw;
}

/** Gate server/API — runtime. */
export function isBankingModuleEnabled(): boolean {
  return parseBankingEnvFlag(process.env[BANKING_MODULE_FLAG]);
}

/**
 * Fallback client — NEXT_PUBLIC obrigatório.
 * Preferir prop `bankingUiEnabled` vinda do Server Component em Configurações.
 */
export function isBankingModuleEnabledForUi(): boolean {
  return parseBankingEnvFlag(readPublicBankingEnvRaw());
}

/**
 * Resolução server-side em request time (RSC).
 * Usa NEXT_PUBLIC — disponível no servidor Vercel em runtime por request.
 */
export function resolveBankingUiEnabled(): boolean {
  return parseBankingEnvFlag(readPublicBankingEnvRaw());
}

export type BankingUiDiagnostics = {
  nextPublicRaw: string;
  bankingUiEnabled: boolean;
  serverModuleEnabled: boolean;
  vercelEnv: string;
  nodeEnv: string;
};

export function getBankingUiDiagnostics(bankingUiEnabled: boolean): BankingUiDiagnostics {
  return {
    nextPublicRaw: getPublicBankingFlagRaw(),
    bankingUiEnabled,
    serverModuleEnabled: isBankingModuleEnabled(),
    vercelEnv: process.env.VERCEL_ENV ?? '(undefined)',
    nodeEnv: process.env.NODE_ENV ?? '(undefined)',
  };
}

/** Banner de diagnóstico — Preview Vercel ou desenvolvimento local. */
export function shouldShowBankingUiDiagnostics(): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  return process.env.VERCEL_ENV === 'preview';
}
