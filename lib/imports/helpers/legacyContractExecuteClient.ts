/**
 * Cliente — execução da importação de Contratos Antigos.
 */

import { appendLegacyContractDocumentsFormData } from '@/lib/imports/helpers/legacyContractFormData';
import { getLegacyContractValidationHttpErrorMessage } from '@/lib/imports/helpers/legacyContractHttpErrors';
import {
  buildLegacyContractValidationUploadPlan,
  type LegacyContractValidationUploadPlan,
} from '@/lib/imports/helpers/legacyContractValidationClient';
import { uploadLegacyDocumentsToStaging } from '@/lib/imports/helpers/legacyContractStagingUpload';
import {
  assertLegacyDocumentFilesWithinLimits,
  getLegacyDocumentUploadTotalBytes,
  LEGACY_CONTRACT_VERCEL_SAFE_REQUEST_BYTES,
} from '@/lib/imports/modules/legacy-contracts/uploadLimits';

function needsLegacyExecuteStagingTransport(documentFiles: File[]): boolean {
  if (documentFiles.some((file) => file.size > LEGACY_CONTRACT_VERCEL_SAFE_REQUEST_BYTES)) {
    return true;
  }
  return getLegacyDocumentUploadTotalBytes(documentFiles) > LEGACY_CONTRACT_VERCEL_SAFE_REQUEST_BYTES;
}

async function buildLegacyExecuteFormPayload(
  documentFiles: File[],
  activeTenantId: string | null,
): Promise<{
  documentFiles: File[];
  documentStoragePaths: Array<{ storagePath: string; fileName: string }>;
}> {
  assertLegacyDocumentFilesWithinLimits(documentFiles);

  if (!needsLegacyExecuteStagingTransport(documentFiles)) {
    return { documentFiles, documentStoragePaths: [] };
  }

  if (!activeTenantId) {
    throw new Error('Empresa ativa não identificada para enviar arquivos grandes.');
  }

  const uploadPlan: LegacyContractValidationUploadPlan =
    buildLegacyContractValidationUploadPlan(documentFiles);
  const stagedRefs = await uploadLegacyDocumentsToStaging(
    documentFiles,
    activeTenantId,
    uploadPlan.sessionId,
  );

  return { documentFiles: [], documentStoragePaths: stagedRefs };
}

export async function executeLegacyContractsImport(
  documentFiles: File[],
  activeTenantId: string | null,
) {
  const payload = await buildLegacyExecuteFormPayload(documentFiles, activeTenantId);
  const formData = new FormData();
  appendLegacyContractDocumentsFormData(formData, {
    ...payload,
    activeTenantId,
    confirmed: true,
  });

  const response = await fetch('/api/data-migration/legacy-contracts/execute', {
    method: 'POST',
    body: formData,
    credentials: 'same-origin',
  });

  const body = await response.json().catch(() => ({} as Record<string, unknown>));
  if (!response.ok) {
    throw new Error(
      getLegacyContractValidationHttpErrorMessage(response.status, body) ||
        'Falha ao anexar contratos antigos.',
    );
  }

  return body.result;
}
