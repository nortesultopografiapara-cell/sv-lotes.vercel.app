import { SV_LOTES_LOGO_PATH } from '@/lib/brand';

/** URL absoluta da logo da plataforma (relatórios no browser). */
export function getSvLotesLogoAbsoluteUrl(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${SV_LOTES_LOGO_PATH}`;
  }
  const site = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL;
  if (site) {
    const base = site.startsWith('http') ? site : `https://${site}`;
    return `${base}${SV_LOTES_LOGO_PATH}`;
  }
  return SV_LOTES_LOGO_PATH;
}

/** Logo do tenant ou, se ausente, logo oficial SV LOTES. */
export function getReportHeaderLogoUrl(tenantLogoUrl?: string | null): string {
  return tenantLogoUrl || getSvLotesLogoAbsoluteUrl();
}

/** Carrega imagem (URL absoluta ou relativa) como data URL PNG no browser. */
export function loadImageAsBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } else {
        reject(new Error('canvas'));
      }
    };
    img.onerror = reject;
    img.src = url;
  });
}

export async function loadReportHeaderLogoBase64(
  tenantLogoUrl?: string | null
): Promise<string | null> {
  try {
    return await loadImageAsBase64(getReportHeaderLogoUrl(tenantLogoUrl));
  } catch {
    return null;
  }
}
