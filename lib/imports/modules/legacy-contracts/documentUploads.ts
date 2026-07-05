/**
 * Monta buffers de upload — Contratos Antigos (API).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { summarizeLegacyDocumentFileNames } from '@/lib/imports/helpers/legacyContractFormData';
import { LEGACY_CONTRACTS_STORAGE_BUCKET } from '@/lib/imports/modules/legacy-contracts/constants';

export type LegacyContractDocumentUploadRef = {
  buffer: Buffer;
  fileName: string;
};

export async function buildLegacyContractDocumentUploadsFromFiles(
  documentFiles: File[],
): Promise<LegacyContractDocumentUploadRef[]> {
  return Promise.all(
    documentFiles.map(async (file) => ({
      fileName: file.name,
      buffer: Buffer.from(await file.arrayBuffer()),
    })),
  );
}

export async function downloadLegacyContractStagingUploads(
  admin: SupabaseClient,
  documentStoragePaths: Array<{ storagePath: string; fileName: string }>,
): Promise<LegacyContractDocumentUploadRef[]> {
  const uploads: LegacyContractDocumentUploadRef[] = [];

  for (const entry of documentStoragePaths) {
    const { data, error } = await admin.storage
      .from(LEGACY_CONTRACTS_STORAGE_BUCKET)
      .download(entry.storagePath);

    if (error || !data) {
      throw new Error(
        `Não foi possível ler "${entry.fileName}" do storage: ${error?.message || 'arquivo ausente'}.`,
      );
    }

    uploads.push({
      fileName: entry.fileName,
      buffer: Buffer.from(await data.arrayBuffer()),
    });
  }

  return uploads;
}

export async function resolveLegacyContractDocumentUploads(params: {
  admin: SupabaseClient;
  documentFiles: File[];
  documentStoragePaths?: Array<{ storagePath: string; fileName: string }>;
}): Promise<{
  documentUploads: LegacyContractDocumentUploadRef[];
  documentsFileName: string;
}> {
  const documentStoragePaths = params.documentStoragePaths ?? [];
  const directUploads = await buildLegacyContractDocumentUploadsFromFiles(params.documentFiles);
  const stagedUploads = await downloadLegacyContractStagingUploads(
    params.admin,
    documentStoragePaths,
  );

  const nameSources = [
    ...params.documentFiles,
    ...documentStoragePaths.map(
      (entry) => new File([], entry.fileName, { type: 'application/octet-stream' }),
    ),
  ];

  return {
    documentUploads: [...directUploads, ...stagedUploads],
    documentsFileName: summarizeLegacyDocumentFileNames(nameSources),
  };
}

/** @deprecated Use resolveLegacyContractDocumentUploads */
export async function buildLegacyContractDocumentUploads(documentFiles: File[]) {
  const documentUploads = await buildLegacyContractDocumentUploadsFromFiles(documentFiles);
  return {
    documentUploads,
    documentsFileName: summarizeLegacyDocumentFileNames(documentFiles),
  };
}
