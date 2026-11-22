/**
 * Autorização C6 por empresa da sessão.
 * Configuração e teste de conexão não dependem de UUID fixo.
 * A emissão não é concedida aqui: ela só existe quando a própria integração
 * grava metadata.c6.emission_enabled, por ação explícita do administrador.
 */

export type C6CompanyOperation = 'config' | 'connection' | 'emission';

export function isC6CompanyOperationEnabled(
  companyId: string | null | undefined,
  operation: C6CompanyOperation,
): boolean {
  const id = String(companyId || '').trim();
  if (!id) return false;
  if (operation === 'config' || operation === 'connection') return true;
  return false;
}
