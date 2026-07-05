/**
 * Cliente — validação de PDFs/ZIP (Contratos Antigos).
 */

import {
  appendLegacyContractDocumentsFormData,
  summarizeLegacyDocumentFileNames,
} from '@/lib/imports/helpers/legacyContractFormData';
import { getLegacyContractValidationHttpErrorMessage } from '@/lib/imports/helpers/legacyContractHttpErrors';
import {
  uploadLegacyDocumentsToStaging,
  type LegacyContractStagingUploadRef,
} from '@/lib/imports/helpers/legacyContractStagingUpload';
import { mergeLegacyContractValidationResults } from '@/lib/imports/modules/legacy-contracts/mergeValidationResults';
import type { LegacyContractImportValidationResult } from '@/lib/imports/modules/legacy-contracts/types';
import {
  assertLegacyDocumentFilesWithinLimits,
  chunkLegacyDocumentFilesForUpload,
  shouldStageLegacyDocumentFile,
} from '@/lib/imports/modules/legacy-contracts/uploadLimits';

const VALIDATION_TIMEOUT_MS = 120_000;

export type LegacyContractValidationUploadPlan = {
  directFiles: File[];
  stagedFiles: File[];
  sessionId: string;
};

export function buildLegacyContractValidationUploadPlan(
  documentFiles: File[],
): LegacyContractValidationUploadPlan {
  assertLegacyDocumentFilesWithinLimits(documentFiles);

  const directFiles: File[] = [];
  const stagedFiles: File[] = [];

  for (const file of documentFiles) {
    if (shouldStageLegacyDocumentFile(file)) {
      stagedFiles.push(file);
    } else {
      directFiles.push(file);
    }
  }

  return {
    directFiles,
    stagedFiles,
    sessionId:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `legacy-${Date.now()}`,
  };
}

async function postLegacyContractValidationRequest(
  params: {
    documentFiles: File[];
    documentStoragePaths?: LegacyContractStagingUploadRef[];
    activeTenantId: string | null;
  },
): Promise<LegacyContractImportValidationResult> {
  const formData = new FormData();
  appendLegacyContractDocumentsFormData(formData, {
    documentFiles: params.documentFiles,
    documentStoragePaths: params.documentStoragePaths,
    activeTenantId: params.activeTenantId,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch('/api/data-migration/legacy-contracts/validate', {
      method: 'POST',
      body: formData,
      credentials: 'same-origin',
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('A validação demorou demais. Tente novamente com menos arquivos.');
    }
    throw new Error(
      err instanceof Error
        ? err.message
        : 'Não foi possível conectar ao servidor de validação.',
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = await response.json().catch(() => ({} as Record<string, unknown>));
  if (!response.ok) {
    throw new Error(getLegacyContractValidationHttpErrorMessage(response.status, payload));
  }

  if (!payload.validation) {
    throw new Error('Resposta de validação inválida.');
  }

  return payload.validation as LegacyContractImportValidationResult;
}

export async function validateLegacyContractsFiles(
  documentFiles: File[],
  activeTenantId: string | null,
): Promise<LegacyContractImportValidationResult> {
  assertLegacyDocumentFilesWithinLimits(documentFiles);

  const uploadPlan = buildLegacyContractValidationUploadPlan(documentFiles);
  const stagedRefs =
    uploadPlan.stagedFiles.length > 0 && activeTenantId
      ? await uploadLegacyDocumentsToStaging(
          uploadPlan.stagedFiles,
          activeTenantId,
          uploadPlan.sessionId,
        )
      : uploadPlan.stagedFiles.length > 0
        ? (() => {
            throw new Error('Empresa ativa não identificada para enviar arquivos grandes.');
          })()
        : [];

  const chunks = chunkLegacyDocumentFilesForUpload(uploadPlan.directFiles);
  const documentsFileName = summarizeLegacyDocumentFileNames(documentFiles);

  if (chunks.length === 0 && stagedRefs.length > 0) {
    return postLegacyContractValidationRequest({
      documentFiles: [],
      documentStoragePaths: stagedRefs,
      activeTenantId,
    });
  }

  const chunkResults: LegacyContractImportValidationResult[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index]!;
    chunkResults.push(
      await postLegacyContractValidationRequest({
        documentFiles: chunk,
        documentStoragePaths: index === 0 ? stagedRefs : undefined,
        activeTenantId,
      }),
    );
  }

  return mergeLegacyContractValidationResults(chunkResults, documentsFileName);
}
