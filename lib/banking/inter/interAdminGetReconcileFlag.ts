/**
 * Flag da rotina TEMPORÁRIA de conciliação GET-only Inter (admin).
 * Off por padrão. Independente de INTER_RESUME_LIVE_EMIT_ENABLED.
 * REMOVER após conciliação do contrato 000000098/2026.
 */

export const INTER_ADMIN_GET_RECONCILE_FLAG_ENV = 'INTER_ADMIN_GET_RECONCILE_ENABLED';

export function isInterAdminGetReconcileEnabled(
  raw: string | null | undefined = process.env.INTER_ADMIN_GET_RECONCILE_ENABLED,
): boolean {
  return String(raw || '').trim().toLowerCase() === 'true';
}
