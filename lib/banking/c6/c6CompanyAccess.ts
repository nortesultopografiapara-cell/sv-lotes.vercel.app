/**
 * Ativação C6 por empresa. Configuração, teste de conexão e emissão são independentes.
 * O mapa nasce vazio: nenhuma empresa opera em Production até autorização expressa.
 */

export type C6CompanyOperation = 'config' | 'connection' | 'emission';

export type C6CompanyGrant = {
  config: boolean;
  connection: boolean;
  emission: boolean;
};

export const C6_COMPANY_OPERATION_GRANTS: Readonly<Record<string, C6CompanyGrant>> = {};

export function c6CompanyGrant(companyId: string | null | undefined): C6CompanyGrant | null {
  const key = String(companyId || '').trim().toLowerCase();
  if (!key) return null;
  return C6_COMPANY_OPERATION_GRANTS[key] || null;
}

export function isC6CompanyOperationEnabled(
  companyId: string | null | undefined,
  operation: C6CompanyOperation,
): boolean {
  const grant = c6CompanyGrant(companyId);
  return grant?.[operation] === true;
}
