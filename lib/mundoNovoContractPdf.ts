/**
 * Chrome PDF do MUNDO_NOVO — isolado do ARAGUAIA.
 *
 * A logo do cabeçalho NÃO vem do gerador HTML. O html2pdf aplica
 * companies.logo_url (marca da empresa RR = Chacreamento Araguaia).
 * Empreendimentos não têm coluna de logo. Sem identidade visual própria,
 * o MUNDO_NOVO não exibe logo — nunca a do Araguaia.
 */

export function resolveMundoNovoPdfChromeLogo(input?: {
  /** Só aceita logo do próprio empreendimento, se um dia existir. */
  projectLogoUrl?: unknown;
}): string | null {
  const fromProject = String(input?.projectLogoUrl ?? '').trim();
  return fromProject || null;
}
