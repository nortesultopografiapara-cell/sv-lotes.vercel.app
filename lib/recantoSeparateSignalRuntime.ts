/**
 * Liberação do sinal separado apenas no runtime do Supabase Develop.
 * As constantes do código permanecem false e são o padrão de Production.
 * O cliente não consegue ligar a gravação: a URL do projeto e as variáveis
 * são lidas no servidor.
 */

import {
  isDevelopHomologRuntime,
  isProductionSupabaseRuntime,
} from '@/lib/homolog/env';

export type RecantoSeparateSignalEnv = Record<string, string | undefined>;

/** Allowlist exclusiva do Develop. Production permanece bloqueada mesmo com estes UUIDs. */
export const RECANTO_SEPARATE_SIGNAL_DEVELOP_COMPANY_ID =
  '06c7bd77-633f-45f7-8c80-f497c6006ce0';
export const RECANTO_SEPARATE_SIGNAL_DEVELOP_PROJECT_ID =
  'a6893672-257b-40b2-a0c2-fb7f48a404aa';

export const RECANTO_SEPARATE_SIGNAL_NOT_ALLOWED_MESSAGE =
  'O parcelamento separado do sinal não está liberado para esta empresa e este empreendimento.';

function runtimeUrl(env: RecantoSeparateSignalEnv): string {
  return env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '';
}

export function isRecantoSeparateSignalWriteEnabled(
  env: RecantoSeparateSignalEnv = process.env,
): boolean {
  const url = runtimeUrl(env);
  if (isProductionSupabaseRuntime(url)) return false;
  if (!isDevelopHomologRuntime(url)) return false;
  return env.RECANTO_SEPARATE_SIGNAL_SCHEMA_APPLIED === 'true'
    && env.RECANTO_SEPARATE_SIGNAL_PERSIST_ENABLED === 'true';
}

export function isRecantoSeparateSignalFormEnabled(
  env: RecantoSeparateSignalEnv = process.env,
): boolean {
  return isRecantoSeparateSignalWriteEnabled(env)
    && env.RECANTO_SEPARATE_SIGNAL_ENABLED === 'true';
}

function sameId(value: unknown, expected: string): boolean {
  return String(value || '').trim().toLowerCase() === expected;
}

export function isRecantoSeparateSignalAllowed(
  companyId: unknown,
  projectId: unknown,
  env: RecantoSeparateSignalEnv = process.env,
): boolean {
  if (isProductionSupabaseRuntime(runtimeUrl(env))) return false;
  if (!isRecantoSeparateSignalWriteEnabled(env)) return false;
  return sameId(companyId, RECANTO_SEPARATE_SIGNAL_DEVELOP_COMPANY_ID)
    && sameId(projectId, RECANTO_SEPARATE_SIGNAL_DEVELOP_PROJECT_ID);
}
