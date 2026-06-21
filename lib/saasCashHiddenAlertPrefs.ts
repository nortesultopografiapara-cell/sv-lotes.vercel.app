export const SAAS_CASH_HIDDEN_ALERT_STORAGE_KEY_PREFIX =
  'sv-saas-cash-hidden-marco-expanded';

export function buildSaasCashHiddenAlertStorageKey(userId?: string | null): string {
  const id = String(userId || '').trim();
  return id
    ? `${SAAS_CASH_HIDDEN_ALERT_STORAGE_KEY_PREFIX}:${id}`
    : `${SAAS_CASH_HIDDEN_ALERT_STORAGE_KEY_PREFIX}:anonymous`;
}

export function readSaasCashHiddenAlertExpanded(
  storage: Pick<Storage, 'getItem'> | null | undefined,
  userId?: string | null,
): boolean {
  if (!storage) return false;
  return storage.getItem(buildSaasCashHiddenAlertStorageKey(userId)) === '1';
}

export function writeSaasCashHiddenAlertExpanded(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  userId: string | null | undefined,
  expanded: boolean,
): void {
  if (!storage) return;
  storage.setItem(
    buildSaasCashHiddenAlertStorageKey(userId),
    expanded ? '1' : '0',
  );
}

export function shouldShowSaasCashHiddenAlert(
  hiddenCount: number | null | undefined,
): boolean {
  return Number(hiddenCount || 0) > 0;
}
