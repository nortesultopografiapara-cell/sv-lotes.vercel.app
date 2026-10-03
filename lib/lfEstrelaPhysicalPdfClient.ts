'use client';

/**
 * Geração do PDF físico LF ESTRELA no navegador (html2pdf homologado).
 *
 * Uma única função produz o Blob de 10 páginas:
 * - Baixar PDF → generate + download
 * - Enviar para assinatura → generate + freeze direto no Storage (sem download)
 *
 * Nunca usa Chromium. Nunca envia o PDF pelo POST da Function (evita HTTP 413).
 */

import { supabase } from '@/lib/supabase';
import {
  assertContractElementReadyForHtml2PdfCapture,
  prepareContractHtmlElementForPagination,
} from '@/lib/contractPaginationEngine';
import { resolveContractHtml2pdfOptions } from '@/lib/contractPdfPostProcess';
import { isLfEstrelaCustomHtml } from '@/lib/lfEstrelaPrintCss';

const LF_ESTRELA_PHYSICAL_PAGES = 10;

export const LF_ESTRELA_SIGNATURE_PREPARE_FAILED_MESSAGE =
  'Não foi possível preparar o documento para assinatura.\nO contrato não foi enviado.';

export type LfEstrelaPhysicalPdfBlob = {
  blob: Blob;
  pageCount: number;
  filename: string;
};

export type LfEstrelaPhysicalFreezeTrace = {
  contractId: string;
  blobSize: number;
  pageCount: number | null;
  sha256: string | null;
  bucket: string | null;
  storagePath: string | null;
  uploadStatus: string;
  storedSize: number | null;
};

function jsPdfPageCount(pdf: {
  internal?: { getNumberOfPages?: () => number };
  getNumberOfPages?: () => number;
}): number {
  return Number(pdf?.internal?.getNumberOfPages?.() || pdf?.getNumberOfPages?.() || 0);
}

async function sha256HexFromBlob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function generateLfEstrelaPhysicalPdfBlob(input: {
  html: string;
  filename: string;
  tenant?: Record<string, unknown> | null;
}): Promise<LfEstrelaPhysicalPdfBlob> {
  const html = String(input.html || '');
  if (!isLfEstrelaCustomHtml(html)) {
    throw new Error('HTML não é o instrumento LF ESTRELA.');
  }
  const filename = String(input.filename || 'contrato.pdf').trim() || 'contrato.pdf';
  const { default: html2pdf } = await import('html2pdf.js');
  const element = document.createElement('div');
  element.innerHTML = html;
  prepareContractHtmlElementForPagination(element);
  assertContractElementReadyForHtml2PdfCapture(element);
  const opt = resolveContractHtml2pdfOptions(input.tenant || {}, filename, html);
  try {
    const pdf = await html2pdf().from(element).set(opt).toPdf().get('pdf');
    const blob = pdf.output('blob') as Blob;
    const pageCount = jsPdfPageCount(pdf);
    return { blob, pageCount, filename };
  } finally {
    element.remove();
  }
}

export async function freezeLfEstrelaPhysicalPdfBlob(
  contractId: string,
  blob: Blob,
  pageCount: number,
): Promise<LfEstrelaPhysicalFreezeTrace> {
  const trace: LfEstrelaPhysicalFreezeTrace = {
    contractId,
    blobSize: blob?.size || 0,
    pageCount: pageCount || null,
    sha256: null,
    bucket: null,
    storagePath: null,
    uploadStatus: 'pending',
    storedSize: null,
  };

  const fail = (error: string, extra?: Record<string, unknown>): never => {
    console.error('[LF PHYSICAL STORAGE TRACE]', { ...trace, ...extra, error });
    throw new Error(error);
  };

  if (!blob || blob.size < 8) {
    fail('PDF físico vazio — freeze não enviado.');
  }
  if (pageCount !== LF_ESTRELA_PHYSICAL_PAGES) {
    fail(
      `Base física LF ESTRELA inválida: esperado ${LF_ESTRELA_PHYSICAL_PAGES} páginas, encontrado ${pageCount}. Gere/congele novamente o PDF físico homologado.`,
    );
  }

  const header = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
  const isPdf =
    header.length >= 5 &&
    header[0] === 0x25 &&
    header[1] === 0x50 &&
    header[2] === 0x44 &&
    header[3] === 0x46;
  if (!isPdf) {
    fail('Arquivo gerado não é PDF.');
  }

  trace.sha256 = await sha256HexFromBlob(blob);

  const prepareRes = await fetch(`/api/contracts/${contractId}/physical-pdf`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'prepare',
      pageCount,
      sha256: trace.sha256,
      blobSize: blob.size,
    }),
  });
  const prepare = (await prepareRes.json().catch(() => null)) as {
    error?: string;
    reused?: boolean;
    bucket?: string;
    storagePath?: string;
    signedUrl?: string;
    token?: string;
    path?: string;
    pageCount?: number;
    sha256?: string;
    storedSize?: number;
  } | null;
  if (!prepareRes.ok) {
    fail(prepare?.error || `Prepare ${prepareRes.status}`, {
      uploadStatus: 'prepare_failed',
    });
  }

  trace.bucket = typeof prepare?.bucket === 'string' ? prepare.bucket : null;
  trace.storagePath =
    typeof prepare?.storagePath === 'string' ? prepare.storagePath : null;

  if (prepare?.reused) {
    trace.uploadStatus = 'reused';
    trace.pageCount =
      typeof prepare.pageCount === 'number' ? prepare.pageCount : pageCount;
    trace.sha256 = typeof prepare.sha256 === 'string' ? prepare.sha256 : trace.sha256;
    trace.storedSize =
      typeof prepare.storedSize === 'number' ? prepare.storedSize : blob.size;
    console.info('[LF PHYSICAL STORAGE TRACE]', trace);
    return trace;
  }

  const signedUrl = String(prepare?.signedUrl || '').trim();
  const token = String(prepare?.token || '').trim();
  const path = String(prepare?.path || prepare?.storagePath || '').trim();
  const bucket = String(prepare?.bucket || '').trim();
  if (!signedUrl || !token || !path || !bucket) {
    fail('Autorização de upload incompleta (signed URL ausente).');
  }

  const { error: signedUploadError } = await supabase.storage
    .from(bucket)
    .uploadToSignedUrl(path, token, blob, {
      contentType: 'application/pdf',
      upsert: true,
    });

  let storageHttp = 0;
  if (signedUploadError) {
    const putRes = await fetch(signedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/pdf',
        Authorization: `Bearer ${token}`,
        'x-upsert': 'true',
      },
      body: blob,
    });
    storageHttp = putRes.status;
    if (!putRes.ok) {
      const detail = await putRes.text().catch(() => '');
      fail(
        `Falha no upload direto ao Storage (${storageHttp}): ${detail || signedUploadError.message}`,
        { uploadStatus: 'failed' },
      );
    }
  } else {
    storageHttp = 200;
  }

  const confirmRes = await fetch(`/api/contracts/${contractId}/physical-pdf`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'confirm',
      pageCount,
      sha256: trace.sha256,
      blobSize: blob.size,
    }),
  });
  const confirm = (await confirmRes.json().catch(() => null)) as {
    error?: string;
    pageCount?: number;
    sha256?: string;
    storagePath?: string;
    bucket?: string;
    storedSize?: number;
  } | null;
  if (!confirmRes.ok) {
    fail(confirm?.error || `Confirm ${confirmRes.status}`, {
      uploadStatus: 'confirm_failed',
    });
  }

  trace.uploadStatus = 'success';
  trace.pageCount =
    typeof confirm?.pageCount === 'number' ? confirm.pageCount : pageCount;
  trace.sha256 = typeof confirm?.sha256 === 'string' ? confirm.sha256 : trace.sha256;
  trace.bucket = typeof confirm?.bucket === 'string' ? confirm.bucket : bucket;
  trace.storagePath =
    typeof confirm?.storagePath === 'string' ? confirm.storagePath : path;
  trace.storedSize =
    typeof confirm?.storedSize === 'number' ? confirm.storedSize : blob.size;
  console.info('[LF PHYSICAL STORAGE TRACE]', { ...trace, storageHttp });
  return trace;
}

export async function ensureLfEstrelaPhysicalFrozenForSignature(input: {
  contractId: string;
  html: string;
  filename: string;
  tenant?: Record<string, unknown> | null;
}): Promise<LfEstrelaPhysicalFreezeTrace> {
  try {
    const generated = await generateLfEstrelaPhysicalPdfBlob({
      html: input.html,
      filename: input.filename,
      tenant: input.tenant,
    });
    return await freezeLfEstrelaPhysicalPdfBlob(
      input.contractId,
      generated.blob,
      generated.pageCount,
    );
  } catch (err) {
    console.error('[LF PHYSICAL STORAGE TRACE]', {
      contractId: input.contractId,
      uploadStatus: 'send_prepare_failed',
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error(LF_ESTRELA_SIGNATURE_PREPARE_FAILED_MESSAGE);
  }
}
