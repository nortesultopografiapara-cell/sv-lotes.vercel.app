/**
 * Extrai metadados do arquivo selecionado (sem leitura/gravação de dados).
 */

import { ACCEPTED_IMPORT_EXTENSIONS, ACCEPTED_LEGACY_DOCUMENT_EXTENSIONS } from '@/lib/imports/constants';
import { formatImportFileSize } from '@/lib/imports/helpers/formatFileSize';
import type { UploadedImportFileMeta } from '@/lib/imports/types';

function extractExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0) return '';
  return fileName.slice(dot).toLowerCase();
}

export function isAcceptedLegacyDocumentFile(file: File): boolean {
  const ext = extractExtension(file.name);
  if (
    ACCEPTED_LEGACY_DOCUMENT_EXTENSIONS.includes(
      ext as (typeof ACCEPTED_LEGACY_DOCUMENT_EXTENSIONS)[number],
    )
  ) {
    return true;
  }
  const mime = String(file.type || '').toLowerCase();
  return mime.includes('pdf') || mime.includes('zip');
}

export function isAcceptedImportFile(file: File): boolean {
  const ext = extractExtension(file.name);
  if (ACCEPTED_IMPORT_EXTENSIONS.includes(ext as (typeof ACCEPTED_IMPORT_EXTENSIONS)[number])) {
    return true;
  }
  const mime = String(file.type || '').toLowerCase();
  return mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv');
}

export function parseImportFileMeta(file: File): UploadedImportFileMeta {
  return {
    name: file.name,
    sizeBytes: file.size,
    sizeLabel: formatImportFileSize(file.size),
    extension: extractExtension(file.name) || '—',
    mimeType: file.type || 'application/octet-stream',
    selectedAt: new Date().toISOString(),
    lastModified: file.lastModified
      ? new Date(file.lastModified).toISOString()
      : null,
  };
}
