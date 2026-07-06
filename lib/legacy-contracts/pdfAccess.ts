/**
 * Acesso seguro a PDFs — Contratos Antigos.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { LEGACY_CONTRACTS_STORAGE_BUCKET } from '@/lib/imports/modules/legacy-contracts/constants';
import {
  isLegacyContractStoragePathInTenantScope,
  normalizeLegacyContractStoragePath,
} from '@/lib/legacy-contracts/storagePathAccess';
import { LegacyContractDocumentError } from '@/lib/legacyContractDocumentService';

export const LEGACY_CONTRACT_PDF_SIGNED_URL_TTL_SECONDS = 60 * 60;
export const LEGACY_CONTRACT_PDF_NOT_FOUND_MESSAGE = 'PDF não encontrado no armazenamento.';

export type LegacyContractPdfAccessResult = {
  url: string;
  fileName: string;
  mimeType: string;
  expiresIn: number;
  storagePath: string;
};

function isStorageObjectMissingError(message: string): boolean {
  const normalized = String(message || '').toLowerCase();
  return (
    normalized.includes('not found') ||
    normalized.includes('object not found') ||
    normalized.includes('does not exist') ||
    normalized.includes('no such key')
  );
}

export async function resolveLegacyContractPdfAccess(params: {
  admin: SupabaseClient;
  storagePath: string;
  fileName: string;
  tenantId: string;
  expiresInSeconds?: number;
}): Promise<LegacyContractPdfAccessResult> {
  const normalizedPath = normalizeLegacyContractStoragePath(params.storagePath);
  if (!normalizedPath) {
    throw new LegacyContractDocumentError('Caminho do PDF ausente.', 404);
  }

  if (!isLegacyContractStoragePathInTenantScope(normalizedPath, params.tenantId)) {
    throw new LegacyContractDocumentError('Arquivo fora do escopo do tenant.', 403);
  }

  const expiresIn = params.expiresInSeconds ?? LEGACY_CONTRACT_PDF_SIGNED_URL_TTL_SECONDS;

  const { data, error } = await params.admin.storage
    .from(LEGACY_CONTRACTS_STORAGE_BUCKET)
    .createSignedUrl(normalizedPath, expiresIn);

  if (error || !data?.signedUrl) {
    const message = error?.message || '';
    if (isStorageObjectMissingError(message)) {
      throw new LegacyContractDocumentError(LEGACY_CONTRACT_PDF_NOT_FOUND_MESSAGE, 404);
    }
    throw new LegacyContractDocumentError(
      message || 'Não foi possível gerar URL segura para o PDF.',
      404,
    );
  }

  return {
    url: data.signedUrl,
    fileName: params.fileName || 'contrato-antigo.pdf',
    mimeType: 'application/pdf',
    expiresIn,
    storagePath: normalizedPath,
  };
}
