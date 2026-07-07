/**
 * Imagens do contrato Recanto Primavera — assinatura embutida para preview/PDF.
 */

import { sanitizeContractField } from '@/lib/recantoPrimaveraCompanyProfile';

function pickSignatureUrl(tenant: Record<string, unknown> | null | undefined): string {
  const row = tenant && typeof tenant === 'object' ? tenant : {};
  return sanitizeContractField(row.signature_url);
}

export function replaceRecantoSignatureSrcInHtml(
  html: string,
  dataUrl: string | null,
  originalUrl?: string,
): string {
  if (!dataUrl) return html;
  const url = String(originalUrl || '').trim();
  if (url) {
    return html.split(url).join(dataUrl);
  }
  return html.replace(
    /<img([^>]*alt=["']Assinatura["'][^>]*)>/gi,
    (match) => match.replace(/src=["'][^"']*["']/, `src="${dataUrl}"`),
  );
}

export async function loadRecantoSignatureDataUrlServer(
  signatureUrl: string,
): Promise<string | null> {
  const url = String(signatureUrl || '').trim();
  if (!url) return null;
  if (url.startsWith('data:')) return url;

  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get('content-type') || 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export function loadRecantoSignatureDataUrlBrowser(
  signatureUrl: string,
): Promise<string | null> {
  const url = String(signatureUrl || '').trim();
  if (!url) return Promise.resolve(null);
  if (url.startsWith('data:')) return Promise.resolve(url);

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export async function embedRecantoContractSignatureInHtml(
  html: string,
  tenant: Record<string, unknown> | null | undefined,
): Promise<string> {
  const signatureUrl = pickSignatureUrl(tenant);
  if (!signatureUrl || !html.includes('alt="Assinatura"')) return html;

  const dataUrl =
    typeof window === 'undefined'
      ? await loadRecantoSignatureDataUrlServer(signatureUrl)
      : await loadRecantoSignatureDataUrlBrowser(signatureUrl);

  return replaceRecantoSignatureSrcInHtml(html, dataUrl, signatureUrl);
}
