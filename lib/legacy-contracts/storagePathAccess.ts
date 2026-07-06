/**
 * Normalização e validação de caminhos no bucket legacy-contracts.
 */

import { LEGACY_CONTRACTS_STORAGE_BUCKET } from '@/lib/imports/modules/legacy-contracts/constants';

export function normalizeLegacyContractStoragePath(storagePath: string): string {
  let path = String(storagePath || '').trim().replace(/^\/+/, '');
  if (!path) return '';

  const bucketPrefix = `${LEGACY_CONTRACTS_STORAGE_BUCKET}/`;
  if (path.startsWith(bucketPrefix)) {
    path = path.slice(bucketPrefix.length);
  }

  return path.replace(/^\/+/, '');
}

export function isLegacyContractStoragePathInTenantScope(
  storagePath: string,
  tenantId: string,
): boolean {
  const normalized = normalizeLegacyContractStoragePath(storagePath);
  const tenant = String(tenantId || '').trim();
  if (!normalized || !tenant) return false;

  return (
    normalized.startsWith(`${tenant}/`) ||
    normalized === tenant ||
    normalized.includes(`/${tenant}/`)
  );
}
