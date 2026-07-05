/**
 * Upload direto ao Supabase Storage — contorna limite de 4,5 MB da Vercel.
 */

import { LEGACY_CONTRACTS_STORAGE_BUCKET } from '@/lib/imports/modules/legacy-contracts/constants';
import { supabase } from '@/lib/supabase';

export type LegacyContractStagingUploadRef = {
  storagePath: string;
  fileName: string;
};

export function buildLegacyContractStagingPath(
  tenantId: string,
  sessionId: string,
  fileName: string,
): string {
  const safeName = fileName.replace(/[^\w.\-()+\s]/g, '_');
  return `${tenantId}/migration-staging/${sessionId}/${safeName}`;
}

export async function uploadLegacyDocumentsToStaging(
  files: File[],
  tenantId: string,
  sessionId: string,
): Promise<LegacyContractStagingUploadRef[]> {
  const refs: LegacyContractStagingUploadRef[] = [];

  for (const file of files) {
    const storagePath = buildLegacyContractStagingPath(tenantId, sessionId, file.name);
    const { error } = await supabase.storage
      .from(LEGACY_CONTRACTS_STORAGE_BUCKET)
      .upload(storagePath, file, {
        upsert: true,
        contentType: file.type || undefined,
      });

    if (error) {
      throw new Error(
        `Falha ao enviar "${file.name}" para validação: ${error.message}`,
      );
    }

    refs.push({ storagePath, fileName: file.name });
  }

  return refs;
}
