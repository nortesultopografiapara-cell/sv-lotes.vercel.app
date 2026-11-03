/**
 * Seletor de versões do contrato de venda — ordenação e HTML persistido.
 * Não altera is_current nem persiste nada.
 */

export type ContractVersionSelectRow = {
  id?: string | null;
  version?: number | string | null;
  created_at?: string | null;
  generated_html?: string | null;
  html_content?: string | null;
  is_current?: boolean | null;
};

export function sortContractVersionsNewestFirst<T extends ContractVersionSelectRow>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const versionDelta = Number(b.version ?? 1) - Number(a.version ?? 1);
    if (versionDelta !== 0) return versionDelta;
    return (
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );
  });
}

export function resolveContractVersionHtml(
  ver: ContractVersionSelectRow | null | undefined,
): string {
  return String(ver?.generated_html || ver?.html_content || '').trim();
}

export function isCurrentContractVersion(
  ver: ContractVersionSelectRow | null | undefined,
  selectedId?: string | null,
): boolean {
  if (!ver) return false;
  if (ver.is_current === true) return true;
  return Boolean(selectedId && ver.id === selectedId && ver.is_current !== false);
}
