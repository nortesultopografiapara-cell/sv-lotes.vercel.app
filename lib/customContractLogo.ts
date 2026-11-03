/**
 * Logotipo dinâmico do modelo CUSTOM.
 * Fonte: companies.logo_url (Configurações → Aparência).
 * O HTML do modelo guarda o token, não uma cópia fixa da imagem.
 */

export const COMPANY_LOGO_KEY = 'COMPANY_LOGO_URL';
export const COMPANY_LOGO_TOKEN = `{{${COMPANY_LOGO_KEY}}}`;
export const COMPANY_LOGO_EDITOR_EMPTY = '[Logo da empresa]';
export const COMPANY_LOGO_PREVIEW_EMPTY = '[SEM LOGO CADASTRADO]';

export type CompanyLogoAlign = 'left' | 'center' | 'right';

export type CompanyLogoLayout = {
  align: CompanyLogoAlign;
  width: number;
  marginBefore: number;
  marginAfter: number;
};

export const CUSTOM_COMPANY_LOGO_DEFAULTS: CompanyLogoLayout = {
  align: 'left',
  width: 180,
  marginBefore: 0,
  marginAfter: 12,
};

export function isSafeCompanyLogoUrl(value: string | null | undefined): boolean {
  return /^(https?:|data:image\/)/i.test(String(value || '').trim());
}

export function normalizeCompanyLogoAlign(value: unknown): CompanyLogoAlign {
  const align = String(value || '').toLowerCase();
  if (align === 'center' || align === 'right') return align;
  return 'left';
}

export function normalizeCompanyLogoWidth(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return CUSTOM_COMPANY_LOGO_DEFAULTS.width;
  return Math.min(480, Math.max(64, Math.round(n)));
}

export function normalizeCompanyLogoSpacing(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(96, Math.max(0, Math.round(n)));
}

export function normalizeCompanyLogoLayout(
  partial?: Partial<CompanyLogoLayout> | null,
): CompanyLogoLayout {
  return {
    align: normalizeCompanyLogoAlign(partial?.align),
    width: normalizeCompanyLogoWidth(partial?.width ?? CUSTOM_COMPANY_LOGO_DEFAULTS.width),
    marginBefore: normalizeCompanyLogoSpacing(
      partial?.marginBefore ?? CUSTOM_COMPANY_LOGO_DEFAULTS.marginBefore,
    ),
    marginAfter: normalizeCompanyLogoSpacing(
      partial?.marginAfter ?? CUSTOM_COMPANY_LOGO_DEFAULTS.marginAfter,
    ),
  };
}

export function parseCompanyLogoLayoutFromHtml(html: string): CompanyLogoLayout {
  const source = String(html || '');
  const attr = (name: string) => {
    const match = source.match(new RegExp(`data-${name}=["']([^"']+)["']`, 'i'));
    return match?.[1];
  };
  const styleAlign = source.match(/text-align\s*:\s*(left|center|right)/i)?.[1];
  const styleWidth = source.match(/--sv-logo-width\s*:\s*(\d+)px/i)?.[1];
  return normalizeCompanyLogoLayout({
    align: attr('align') || styleAlign,
    width: attr('width') || styleWidth,
    marginBefore: attr('margin-before'),
    marginAfter: attr('margin-after'),
  });
}

export function companyLogoBlockStyle(layout: CompanyLogoLayout): string {
  return [
    `text-align:${layout.align}`,
    `margin:${layout.marginBefore}px 0 ${layout.marginAfter}px`,
    `--sv-logo-width:${layout.width}px`,
  ].join(';');
}

export function renderCompanyLogoBlock(layout?: Partial<CompanyLogoLayout> | null): string {
  const next = normalizeCompanyLogoLayout(layout);
  return `<div data-sv-placeholder="${COMPANY_LOGO_KEY}" data-sv-company-logo="true" data-align="${next.align}" data-width="${next.width}" data-margin-before="${next.marginBefore}" data-margin-after="${next.marginAfter}" class="sv-company-logo" style="${companyLogoBlockStyle(next)}">${COMPANY_LOGO_TOKEN}</div>`;
}

export function renderCompanyLogoDisplay(
  layout: Partial<CompanyLogoLayout> | null | undefined,
  logoUrl: string | null | undefined,
  emptyLabel: string,
): string {
  const next = normalizeCompanyLogoLayout(layout);
  const style = companyLogoBlockStyle(next);
  const attrs = `data-sv-placeholder="${COMPANY_LOGO_KEY}" data-sv-company-logo="true" data-align="${next.align}" data-width="${next.width}" data-margin-before="${next.marginBefore}" data-margin-after="${next.marginAfter}" class="sv-company-logo" style="${style}"`;
  if (!isSafeCompanyLogoUrl(logoUrl)) {
    return `<div ${attrs}><span class="sv-company-logo-empty">${escapeLogoHtml(emptyLabel)}</span></div>`;
  }
  const src = escapeLogoHtml(String(logoUrl).trim());
  return `<div ${attrs}><img src="${src}" alt="Logo" class="sv-company-logo-img" style="width:${next.width}px;height:auto;max-width:100%;object-fit:contain" /></div>`;
}

function escapeLogoHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
