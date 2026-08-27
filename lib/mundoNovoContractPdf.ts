/**
 * Chrome PDF do MUNDO_NOVO — isolado do ARAGUAIA.
 *
 * A logo do cabeçalho NÃO vem do gerador HTML nem de companies.logo_url
 * (marca da empresa RR = Chacreamento Araguaia). O MUNDO_NOVO usa somente
 * o asset estático em public/.
 */

/** Caminho público (browser) do PNG oficial. */
export const MUNDO_NOVO_LOGO_PATH = '/logo-chacreamento-mundo-novo.png';

/** Nome do ficheiro em public/ (leitura no servidor). */
export const MUNDO_NOVO_LOGO_PUBLIC_FILE = 'logo-chacreamento-mundo-novo.png';

/** Dimensões nativas do PNG oficial (não deformar). */
export const MUNDO_NOVO_LOGO_NATIVE_WIDTH = 842;
export const MUNDO_NOVO_LOGO_NATIVE_HEIGHT = 566;

const MUNDO_NOVO_LOGO_MAX_WIDTH_MM = 24;
const MUNDO_NOVO_LOGO_MAX_HEIGHT_MM = 16;

export function mundoNovoPdfChromeLogoSizeMm(): {
  widthMm: number;
  heightMm: number;
} {
  const ratio = MUNDO_NOVO_LOGO_NATIVE_WIDTH / MUNDO_NOVO_LOGO_NATIVE_HEIGHT;
  let widthMm = MUNDO_NOVO_LOGO_MAX_WIDTH_MM;
  let heightMm = widthMm / ratio;
  if (heightMm > MUNDO_NOVO_LOGO_MAX_HEIGHT_MM) {
    heightMm = MUNDO_NOVO_LOGO_MAX_HEIGHT_MM;
    widthMm = heightMm * ratio;
  }
  return {
    widthMm: Math.round(widthMm * 10) / 10,
    heightMm: Math.round(heightMm * 10) / 10,
  };
}

/** Sempre o asset oficial — nunca companies.logo_url nem URL de projeto. */
export function resolveMundoNovoPdfChromeLogo(_input?: {
  projectLogoUrl?: unknown;
}): string {
  return MUNDO_NOVO_LOGO_PATH;
}
