/**
 * Limites de upload — Contratos Antigos (Migração de Dados).
 */

/** Limite por arquivo PDF/ZIP enviado pelo usuário. */
export const LEGACY_CONTRACT_MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Limite configurado no Next.js (middleware / proxy). */
export const LEGACY_CONTRACT_MAX_REQUEST_BYTES = 55 * 1024 * 1024;

/**
 * Limite seguro por requisição HTTP na Vercel (4,5 MB hard cap).
 * Arquivos acima disso são enviados diretamente ao Supabase Storage.
 */
export const LEGACY_CONTRACT_VERCEL_SAFE_REQUEST_BYTES = 4 * 1024 * 1024;

export const LEGACY_CONTRACT_PAYLOAD_TOO_LARGE_MESSAGE =
  'O arquivo enviado excede o limite permitido.';

export function getLegacyDocumentUploadTotalBytes(files: Array<{ size: number }>): number {
  return files.reduce((total, file) => total + file.size, 0);
}

export function assertLegacyDocumentFilesWithinLimits(
  files: Array<{ name: string; size: number }>,
): void {
  for (const file of files) {
    if (file.size > LEGACY_CONTRACT_MAX_FILE_BYTES) {
      throw new Error(
        `O arquivo "${file.name}" excede o limite de 50 MB. Reduza o tamanho ou divida o conteúdo.`,
      );
    }
  }
}

export function chunkLegacyDocumentFilesForUpload(files: File[]): File[][] {
  assertLegacyDocumentFilesWithinLimits(files);

  if (files.length === 0) return [];

  const chunks: File[][] = [];
  let currentChunk: File[] = [];
  let currentBytes = 0;

  for (const file of files) {
    if (file.size > LEGACY_CONTRACT_VERCEL_SAFE_REQUEST_BYTES) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentBytes = 0;
      }
      chunks.push([file]);
      continue;
    }

    const nextBytes = currentBytes + file.size;
    if (currentChunk.length > 0 && nextBytes > LEGACY_CONTRACT_VERCEL_SAFE_REQUEST_BYTES) {
      chunks.push(currentChunk);
      currentChunk = [file];
      currentBytes = file.size;
      continue;
    }

    currentChunk.push(file);
    currentBytes += file.size;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

export function shouldStageLegacyDocumentFile(file: File): boolean {
  return file.size > LEGACY_CONTRACT_VERCEL_SAFE_REQUEST_BYTES;
}

export function formatLegacyContractUploadLimit(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${Math.round(mb)} MB`;
}
