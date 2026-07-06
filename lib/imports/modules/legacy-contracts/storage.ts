/**
 * Upload de PDF — contratos antigos.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { LEGACY_CONTRACTS_STORAGE_BUCKET } from '@/lib/imports/modules/legacy-contracts/constants';
import { resolveLegacyContractUploadStoragePath } from '@/lib/legacy-contracts/storagePaths';

export async function uploadLegacyContractPdf(params: {
  admin: SupabaseClient;
  tenantId: string;
  saleId: string;
  projectId?: string | null;
  quadra?: string | null;
  lote?: string | null;
  fileName: string;
  pdfBuffer: Buffer;
}): Promise<{ storagePath: string; publicUrl: string | null }> {
  const storagePath = resolveLegacyContractUploadStoragePath({
    tenantId: params.tenantId,
    saleId: params.saleId,
    projectId: params.projectId,
    quadra: params.quadra,
    lote: params.lote,
    fileName: params.fileName,
  });

  const { error: uploadError } = await params.admin.storage
    .from(LEGACY_CONTRACTS_STORAGE_BUCKET)
    .upload(storagePath, params.pdfBuffer, {
      contentType: 'application/pdf',
      upsert: false,
      cacheControl: '3600',
    });

  if (uploadError) {
    throw new Error(`Falha ao enviar PDF: ${uploadError.message}`);
  }

  const { data: publicData } = params.admin.storage
    .from(LEGACY_CONTRACTS_STORAGE_BUCKET)
    .getPublicUrl(storagePath);

  return {
    storagePath,
    publicUrl: publicData?.publicUrl ?? null,
  };
}
