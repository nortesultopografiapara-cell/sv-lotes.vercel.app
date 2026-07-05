/**
 * Índice de PDFs — contratos antigos (PDF individual ou ZIP).
 */

import JSZip from 'jszip';
import type { LegacyContractPdfIndex } from '@/lib/imports/modules/legacy-contracts/types';
import { normalizeLegacyContractPdfFileName } from '@/lib/imports/modules/legacy-contracts/normalize';

function registerPdf(index: LegacyContractPdfIndex, fileName: string, buffer: Buffer) {
  const normalized = normalizeLegacyContractPdfFileName(fileName);
  if (!normalized.endsWith('.pdf')) return;
  if (!index.has(normalized)) {
    index.set(normalized, buffer);
  }
}

export async function buildLegacyContractPdfIndex(
  buffer: Buffer | ArrayBuffer,
  fileName: string,
): Promise<{ index: LegacyContractPdfIndex; pdfCount: number }> {
  const index: LegacyContractPdfIndex = new Map();
  const data = buffer instanceof Buffer ? buffer : Buffer.from(buffer);
  const lower = fileName.toLowerCase();

  if (lower.endsWith('.zip')) {
    const zip = await JSZip.loadAsync(data);
    const entries = Object.values(zip.files);
    for (const entry of entries) {
      if (entry.dir) continue;
      const content = await entry.async('nodebuffer');
      registerPdf(index, entry.name, content);
    }
  } else if (lower.endsWith('.pdf')) {
    registerPdf(index, fileName, data);
  } else {
    throw new Error('Envie um arquivo PDF ou ZIP contendo PDFs.');
  }

  return { index, pdfCount: index.size };
}

export function lookupLegacyContractPdf(
  index: LegacyContractPdfIndex,
  fileName: string,
): Buffer | null {
  const normalized = normalizeLegacyContractPdfFileName(fileName);
  return index.get(normalized) ?? null;
}

export function suggestSimilarPdfNames(
  index: LegacyContractPdfIndex,
  fileName: string,
  limit = 3,
): string[] {
  const normalized = normalizeLegacyContractPdfFileName(fileName);
  const suggestions: string[] = [];
  for (const key of index.keys()) {
    if (key.includes(normalized.replace('.pdf', '')) || normalized.includes(key.replace('.pdf', ''))) {
      suggestions.push(key);
      if (suggestions.length >= limit) break;
    }
  }
  return suggestions;
}
