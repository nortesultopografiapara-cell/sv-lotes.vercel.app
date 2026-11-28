/**
 * Ambiente efetivo de execução.
 * Não lê chave, não autoriza banco e não substitui o project ref do Supabase.
 * Production na Vercel é o único runtime em que efeito externo real permanece no comportamento já publicado.
 */

import { HOMOLOG_OUTBOUND_BLOCKED_MESSAGE } from '@/lib/homolog/env';

export type ExecutionEnvironment = 'production' | 'preview' | 'development' | 'unknown';

export function resolveExecutionEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): ExecutionEnvironment {
  const vercel = String(env.VERCEL_ENV || '').trim().toLowerCase();
  if (vercel === 'production' || vercel === 'preview' || vercel === 'development') return vercel;
  if (vercel) return 'unknown';
  const nodeEnv = String(env.NODE_ENV || '').trim().toLowerCase();
  if (nodeEnv === 'development' || nodeEnv === 'test') return 'development';
  return 'unknown';
}

/**
 * Fecha efeito real fora da Production da Vercel.
 * Processo sem VERCEL_ENV e sem NODE_ENV permanece no bloqueio já existente pela URL,
 * para os testes locais que simulam o provedor sem serem um deploy.
 */
export function isExecutionEnvironmentBlockingRealOutbound(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const vercel = String(env.VERCEL_ENV || '').trim().toLowerCase();
  if (vercel === 'production') return false;
  if (vercel) return true;
  const nodeEnv = String(env.NODE_ENV || '').trim().toLowerCase();
  return nodeEnv === 'development' || nodeEnv === 'test' || nodeEnv === 'production';
}

export function assertLiveExternalCallAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (isExecutionEnvironmentBlockingRealOutbound(env)) {
    throw new Error(HOMOLOG_OUTBOUND_BLOCKED_MESSAGE);
  }
}
