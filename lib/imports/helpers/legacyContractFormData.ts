/**
 * FormData — upload de planilha + PDFs/ZIP (Contratos Antigos).
 */

import { extractUploadedFile } from '@/lib/imports/uploadFile';
import { isAcceptedLegacyDocumentFile } from '@/lib/imports/helpers/parseImportFileMeta';
import type { LegacyContractManualLinkOverride } from '@/lib/imports/modules/legacy-contracts/types';
import { parseLegacyContractManualLinkOverrides } from '@/lib/imports/helpers/legacyContractManualLinkClient';

export type LegacyContractFormFiles = {
  mappingFile: File | null;
  documentFiles: File[];
  documentStoragePaths: Array<{ storagePath: string; fileName: string }>;
  manualLinkOverrides: LegacyContractManualLinkOverride[];
};

export function extractLegacyContractFormFiles(formData: FormData): LegacyContractFormFiles {
  const mappingFile =
    extractUploadedFile(formData.get('mappingFile'), 'mapeamento_contratos.xlsx') ??
    extractUploadedFile(formData.get('file'), 'mapeamento_contratos.xlsx');

  const documentFiles = formData
    .getAll('documentFiles')
    .map((entry, index) =>
      extractUploadedFile(entry, index === 0 ? 'contratos.zip' : `documento_${index + 1}.pdf`),
    )
    .filter((file): file is File => file != null);

  if (documentFiles.length === 0) {
    const legacySingle = extractUploadedFile(formData.get('documents'), 'contratos.zip');
    if (legacySingle) documentFiles.push(legacySingle);
  }

  const documentStoragePaths = parseLegacyContractStoragePaths(formData);
  const manualLinkOverrides = parseLegacyContractManualLinkOverrides(formData);

  return { mappingFile, documentFiles, documentStoragePaths, manualLinkOverrides };
}

function parseLegacyContractStoragePaths(
  formData: FormData,
): Array<{ storagePath: string; fileName: string }> {
  const rawJson = formData.get('documentStoragePaths');
  if (typeof rawJson === 'string' && rawJson.trim()) {
    try {
      const parsed = JSON.parse(rawJson) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((entry) => {
            if (!entry || typeof entry !== 'object') return null;
            const storagePath = (entry as { storagePath?: unknown }).storagePath;
            const fileName = (entry as { fileName?: unknown }).fileName;
            if (typeof storagePath !== 'string' || typeof fileName !== 'string') return null;
            return { storagePath, fileName };
          })
          .filter((entry): entry is { storagePath: string; fileName: string } => entry != null);
      }
    } catch {
      return [];
    }
  }

  return formData
    .getAll('documentStoragePaths')
    .map((entry) => {
      if (typeof entry !== 'string') return null;
      const separator = entry.indexOf('|');
      if (separator <= 0) return null;
      return {
        storagePath: entry.slice(0, separator),
        fileName: entry.slice(separator + 1),
      };
    })
    .filter((entry): entry is { storagePath: string; fileName: string } => entry != null);
}

export function appendLegacyContractFormData(
  formData: FormData,
  params: {
    mappingFile?: File;
    documentFiles: File[];
    documentStoragePaths?: Array<{ storagePath: string; fileName: string }>;
    manualLinkOverrides?: LegacyContractManualLinkOverride[];
    activeTenantId?: string | null;
    confirmed?: boolean;
  },
): void {
  if (params.mappingFile) {
    formData.append('mappingFile', params.mappingFile);
  }
  for (const file of params.documentFiles) {
    formData.append('documentFiles', file);
  }
  if (params.documentStoragePaths?.length) {
    formData.append('documentStoragePaths', JSON.stringify(params.documentStoragePaths));
  }
  if (params.manualLinkOverrides?.length) {
    formData.append('manualLinkOverrides', JSON.stringify(params.manualLinkOverrides));
  }
  if (params.activeTenantId) {
    formData.append('activeTenantId', params.activeTenantId);
  }
  if (params.confirmed) {
    formData.append('confirmed', 'true');
  }
}

export function appendLegacyContractDocumentsFormData(
  formData: FormData,
  params: {
    documentFiles: File[];
    documentStoragePaths?: Array<{ storagePath: string; fileName: string }>;
    manualLinkOverrides?: LegacyContractManualLinkOverride[];
    activeTenantId?: string | null;
    confirmed?: boolean;
  },
): void {
  appendLegacyContractFormData(formData, params);
}

export function summarizeLegacyDocumentFileNames(files: File[]): string {
  if (files.length === 0) return 'documentos';
  if (files.length === 1) return files[0]?.name || 'documento';
  const allPdf = files.every((file) => file.name.toLowerCase().endsWith('.pdf'));
  if (allPdf) return `${files.length} PDFs`;
  return files.map((file) => file.name).join(', ');
}

export function filterAcceptedLegacyDocumentFiles(files: File[]): File[] {
  return files.filter((file) => isAcceptedLegacyDocumentFile(file));
}

export function hasLegacyDocumentUpload(files: File[]): boolean {
  return filterAcceptedLegacyDocumentFiles(files).length > 0;
}
