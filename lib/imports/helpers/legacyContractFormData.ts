/**
 * FormData — upload de planilha + PDFs/ZIP (Contratos Antigos).
 */

import { extractUploadedFile } from '@/lib/imports/uploadFile';
import { isAcceptedLegacyDocumentFile } from '@/lib/imports/helpers/parseImportFileMeta';

export type LegacyContractFormFiles = {
  mappingFile: File | null;
  documentFiles: File[];
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

  return { mappingFile, documentFiles };
}

export function appendLegacyContractFormData(
  formData: FormData,
  params: {
    mappingFile?: File;
    documentFiles: File[];
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
