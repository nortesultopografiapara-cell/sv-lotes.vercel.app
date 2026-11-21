/**
 * Impede a exclusão da empresa piloto C6 em Production.
 * Não altera is_test_company nem outras empresas.
 */

export const COMPANY_DELETION_PROTECTED_COMPANY_ID = 'f26f2331-1885-4ac6-8d0e-4131cc8a8014';

export const COMPANY_DELETION_PROTECTED_MESSAGE =
  'Esta empresa está protegida e não pode ser excluída.';

export function isCompanyDeletionProtected(companyId: string | null | undefined): boolean {
  return (
    String(companyId || '').trim().toLowerCase() ===
    COMPANY_DELETION_PROTECTED_COMPANY_ID.toLowerCase()
  );
}
