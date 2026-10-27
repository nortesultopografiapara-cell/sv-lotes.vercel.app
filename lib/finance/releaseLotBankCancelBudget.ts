/**
 * Orçamento de tempo do cancelamento bancário na liberação de lote.
 * Evita HTML 504 do Vercel (60s) quando há dezenas de cobranças Asaas/Inter.
 * Não aumenta maxDuration. Persistência do progresso = status local já cancelado.
 */

export const RELEASE_BANK_CANCEL_BUDGET_MS = 40_000;
export const MIN_BANK_CANCEL_CALL_MS = 3_000;
export const BANK_CANCEL_IN_PROGRESS_CODE = 'BANK_CANCEL_IN_PROGRESS';
export const BANK_CANCEL_IN_PROGRESS_STATUS = 409;

export function remainingBankCancelBudgetMs(
  startedAtMs: number,
  nowMs: number,
  budgetMs = RELEASE_BANK_CANCEL_BUDGET_MS,
): number {
  return budgetMs - (nowMs - startedAtMs);
}

export function shouldYieldBankCancel(
  startedAtMs: number,
  nowMs: number,
  budgetMs = RELEASE_BANK_CANCEL_BUDGET_MS,
): boolean {
  return remainingBankCancelBudgetMs(startedAtMs, nowMs, budgetMs) < MIN_BANK_CANCEL_CALL_MS;
}

export function isAsaasRateLimitMessage(message: string): boolean {
  return /limite de requisi[cç][oõ]es|too many requests|\b429\b|temporariamente bloqueado/i.test(
    message,
  );
}

export function isAsaasNetworkOrTimeoutMessage(message: string): boolean {
  return /timed?\s*out|etimedout|econnreset|econnrefused|enotfound|network|fetch failed|socket|aborted|temporariamente indispon/i.test(
    message,
  );
}

export function isAsaasAlreadyGoneMessage(message: string): boolean {
  return /404|not found|já (foi )?removid|ja (foi )?removid|already (deleted|cancelled|canceled)/i.test(
    message,
  );
}

export function isAsaasPaidForbiddenMessage(message: string): boolean {
  return /já paga|ja paga|already paid|cancelamento não permitido|cancelamento nao permitido/i.test(
    message,
  );
}

export function bankCancelInProgressMessage(params: {
  provider: 'Asaas' | 'Inter';
  cancelled: number;
  remaining: number;
}): string {
  return (
    `Cancelamento ${params.provider} em andamento (${params.cancelled} concluída(s), ` +
    `${params.remaining} restante(s)). O lote NÃO foi liberado. ` +
    `Confirme novamente para continuar — cobranças já canceladas não serão repetidas.`
  );
}
