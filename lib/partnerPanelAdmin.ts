/**
 * Permissões do painel da empresa parceira (/map, /contracts).
 * Não usar em rotas Master (saas-finance, empresas, etc.).
 */

const EXACT_ADMIN_ROLES = new Set([
  'SUPER_ADMIN',
  'MASTER',
  'MASTER_ADMIN',
  'MASTER-ADMIN',
  'ADMIN',
  'ADMIN_EMPRESA',
  'COMPANY_ADMIN',
]);

/** ADMIN, MASTER, SUPER_ADMIN e equivalentes da empresa parceira. */
export function isPartnerPanelAdmin(role?: string | null): boolean {
  const r = String(role || '').toUpperCase().trim();
  if (!r) return false;
  if (EXACT_ADMIN_ROLES.has(r)) return true;
  if (r.startsWith('MASTER')) return true;
  if (r === 'GESTOR' || r === 'MANAGER') return true;
  if (r.includes('ADMIN') && !r.includes('BROKER')) return true;
  return false;
}
