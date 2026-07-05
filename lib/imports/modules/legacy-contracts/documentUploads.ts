/**
 * Monta buffers de upload — Contratos Antigos (API).
 */

import { summarizeLegacyDocumentFileNames } from '@/lib/imports/helpers/legacyContractFormData';

export async function buildLegacyContractDocumentUploads(
  documentFiles: File[],
): Promise<{
  documentUploads: Array<{ buffer: Buffer; fileName: string }>;
  documentsFileName: string;
}> {
  const documentUploads = await Promise.all(
    documentFiles.map(async (file) => ({
      fileName: file.name,
      buffer: Buffer.from(await file.arrayBuffer()),
    })),
  );

  return {
    documentUploads,
    documentsFileName: summarizeLegacyDocumentFileNames(documentFiles),
  };
}
