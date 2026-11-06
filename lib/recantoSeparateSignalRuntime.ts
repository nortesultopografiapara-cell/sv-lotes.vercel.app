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
