/**
 * Compatibilidade de schema — legacy_contract_documents.
 * Suporta base (20260705140000) e módulo (20260706120000).
 */

export type LegacyContractSchemaMode = 'extended' | 'base';

const EXTENDED_MARKERS = [
  'link_type',
  'is_active',
  'deleted_at',
  'quadra',
  'lote',
  'migration_id',
  'source',
];

export function isLegacyContractSchemaColumnError(message: string): boolean {
  const normalized = String(message || '').toLowerCase();
  if (!normalized) return false;
  if (
    normalized.includes('does not exist') ||
    normalized.includes('column') && normalized.includes('not found') ||
    normalized.includes('42703')
  ) {
    return EXTENDED_MARKERS.some((marker) => normalized.includes(marker));
  }
  return false;
}

export const LEGACY_CONTRACT_BASE_SELECT = [
  'id',
  'sale_id',
  'customer_id',
  'project_id',
  'block_id',
  'original_file_name',
  'notes',
  'contract_number',
  'contract_date',
  'status',
  'created_at',
  'company_id',
  'tenant_id',
].join(', ');

export const LEGACY_CONTRACT_EXTENDED_SELECT = [
  LEGACY_CONTRACT_BASE_SELECT,
  'quadra',
  'lote',
  'link_type',
  'source',
  'migration_id',
].join(', ');
