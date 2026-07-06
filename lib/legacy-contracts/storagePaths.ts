/**
 * Caminhos definitivos no bucket legacy-contracts.
 */

import { sanitizeLegacyContractStorageFileName } from '@/lib/imports/modules/legacy-contracts/normalize';

function sanitizePathSegment(value: string): string {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export function buildLegacyContractDefinitiveStoragePath(params: {
  tenantId: string;
  projectId: string;
  quadra: string;
  lote: string;
  fileName: string;
}): string {
  const quadraSlug = sanitizePathSegment(params.quadra) || 'quadra';
  const loteSlug = sanitizePathSegment(params.lote) || 'lote';
  const file = sanitizeLegacyContractStorageFileName(params.fileName);
  return `${params.tenantId}/${params.projectId}/${quadraSlug}-${loteSlug}/${file}`;
}

export function buildLegacyContractStoragePathFallback(params: {
  tenantId: string;
  saleId: string;
  fileName: string;
}): string {
  const file = sanitizeLegacyContractStorageFileName(params.fileName);
  return `${params.tenantId}/${params.saleId}/${file}`;
}

export function resolveLegacyContractUploadStoragePath(params: {
  tenantId: string;
  saleId: string;
  projectId?: string | null;
  quadra?: string | null;
  lote?: string | null;
  fileName: string;
}): string {
  if (params.projectId && params.quadra?.trim() && params.lote?.trim()) {
    return buildLegacyContractDefinitiveStoragePath({
      tenantId: params.tenantId,
      projectId: params.projectId,
      quadra: params.quadra,
      lote: params.lote,
      fileName: params.fileName,
    });
  }

  return buildLegacyContractStoragePathFallback({
    tenantId: params.tenantId,
    saleId: params.saleId,
    fileName: params.fileName,
  });
}
