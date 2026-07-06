/**
 * Cliente HTTP — visualização/download de PDFs de Contratos Antigos.
 */

import type { LegacyContractPdfAccessResult } from '@/lib/legacy-contracts/pdfAccess';

const PDF_REQUEST_TIMEOUT_MS = 60_000;

export type LegacyContractPdfClientResult = LegacyContractPdfAccessResult;

export async function fetchLegacyContractPdfAccess(
  documentId: string,
  activeTenantId: string | null,
): Promise<LegacyContractPdfClientResult> {
  const params = new URLSearchParams({ format: 'json' });
  if (activeTenantId) params.set('activeTenantId', activeTenantId);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PDF_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `/api/legacy-contracts/${encodeURIComponent(documentId)}/pdf?${params.toString()}`,
      {
        method: 'GET',
        credentials: 'same-origin',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      },
    );

    const payload = (await response.json().catch(() => ({}))) as Partial<LegacyContractPdfAccessResult> & {
      error?: string;
    };

    if (!response.ok) {
      throw new Error(
        (typeof payload.error === 'string' && payload.error.trim()) ||
          `Não foi possível acessar o PDF (HTTP ${response.status}).`,
      );
    }

    if (typeof payload.url !== 'string' || !payload.url.trim()) {
      throw new Error('URL do PDF indisponível.');
    }

    return {
      url: payload.url,
      fileName: typeof payload.fileName === 'string' ? payload.fileName : 'contrato-antigo.pdf',
      mimeType: typeof payload.mimeType === 'string' ? payload.mimeType : 'application/pdf',
      expiresIn: typeof payload.expiresIn === 'number' ? payload.expiresIn : 3600,
      storagePath: typeof payload.storagePath === 'string' ? payload.storagePath : '',
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(
        'A solicitação do PDF excedeu o tempo limite. Verifique sua conexão e tente novamente.',
      );
    }
    if (err instanceof TypeError && /failed to fetch/i.test(err.message)) {
      throw new Error(
        'Falha de conexão ao acessar o PDF. Verifique sua internet ou tente novamente em instantes.',
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function openLegacyContractPdfUrl(url: string, fileName?: string): boolean {
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (opened) return true;

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  if (fileName) {
    anchor.download = fileName;
  }
  anchor.click();
  return true;
}
