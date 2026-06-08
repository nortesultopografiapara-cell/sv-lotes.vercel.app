/**
 * Auditoria de alterações cadastrais do cliente (customer_audit_logs).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type CustomerAuditSource =
  | 'customer_form'
  | 'sale_edit'
  | 'sale_create'
  | 'contract_regeneration'
  | 'import'
  | 'system';

export const CUSTOMER_AUDIT_TRACKED_FIELDS = [
  'rg',
  'rg_issuer',
  'rg_issuer_state',
  'civil_state',
  'marital_status',
  'profession',
  'address',
  'neighborhood',
  'city',
  'state',
  'state_uf',
  'cep',
  'zip_code',
  'phone',
  'email',
] as const;

export type CustomerAuditLogRow = {
  id: string;
  customer_id: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_by: string | null;
  changed_at: string;
  source: CustomerAuditSource;
};

const FIELD_LABELS: Record<string, string> = {
  rg: 'RG',
  rg_issuer: 'Órgão emissor',
  rg_issuer_state: 'UF emissor',
  civil_state: 'Estado Civil',
  marital_status: 'Estado Civil',
  profession: 'Profissão',
  address: 'Endereço',
  neighborhood: 'Bairro',
  city: 'Cidade',
  state: 'UF',
  state_uf: 'UF',
  cep: 'CEP',
  zip_code: 'CEP',
  phone: 'Telefone',
  email: 'E-mail',
};

const SOURCE_LABELS: Record<CustomerAuditSource, string> = {
  customer_form: 'Cadastro de clientes',
  sale_edit: 'Edição de venda',
  sale_create: 'Venda / reserva',
  contract_regeneration: 'Regeneração de contrato',
  import: 'Importação',
  system: 'Sistema',
};

function normalizeAuditValue(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

export function buildCustomerAuditSnapshot(
  record: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!record || typeof record !== 'object') return {};
  const snap: Record<string, unknown> = {};
  for (const field of CUSTOMER_AUDIT_TRACKED_FIELDS) {
    const val = record[field];
    if (val != null && normalizeAuditValue(val) !== '') {
      snap[field] = val;
    }
  }
  return snap;
}

export function extractCustomerAuditChanges(
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
): Array<{ field: string; label: string; oldValue: string; newValue: string }> {
  const changes: Array<{
    field: string;
    label: string;
    oldValue: string;
    newValue: string;
  }> = [];
  const keys = new Set([
    ...Object.keys(oldData),
    ...Object.keys(newData),
  ]);
  for (const field of keys) {
    if (
      !CUSTOMER_AUDIT_TRACKED_FIELDS.includes(
        field as (typeof CUSTOMER_AUDIT_TRACKED_FIELDS)[number],
      )
    ) {
      continue;
    }
    const oldValue = normalizeAuditValue(oldData[field]);
    const newValue = normalizeAuditValue(newData[field]);
    if (oldValue === newValue) continue;
    changes.push({
      field,
      label: FIELD_LABELS[field] || field,
      oldValue: oldValue || '—',
      newValue: newValue || '—',
    });
  }
  return changes;
}

export function customerAuditHasTrackedChanges(
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
): boolean {
  return extractCustomerAuditChanges(oldData, newData).length > 0;
}

export function formatCustomerAuditSource(source: string): string {
  return SOURCE_LABELS[source as CustomerAuditSource] || source;
}

export async function logCustomerAudit(
  supabase: SupabaseClient,
  params: {
    customerId: string;
    oldData: Record<string, unknown>;
    newData: Record<string, unknown>;
    changedBy?: string | null;
    source: CustomerAuditSource;
  },
): Promise<void> {
  const oldSnap = buildCustomerAuditSnapshot(params.oldData);
  const newSnap = buildCustomerAuditSnapshot(params.newData);
  if (!customerAuditHasTrackedChanges(oldSnap, newSnap)) return;

  const row = {
    customer_id: params.customerId,
    old_data: oldSnap,
    new_data: newSnap,
    changed_by: params.changedBy || null,
    changed_at: new Date().toISOString(),
    source: params.source,
  };

  const { error } = await supabase.from('customer_audit_logs').insert([row]);
  if (error) {
    console.warn('CUSTOMER_AUDIT_LOG_WARN', error.message);
  }
}

export async function loadCustomerAuditLogs(
  supabase: SupabaseClient,
  customerId: string,
  limit = 100,
): Promise<CustomerAuditLogRow[]> {
  const { data, error } = await supabase
    .from('customer_audit_logs')
    .select('*')
    .eq('customer_id', customerId)
    .order('changed_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('CUSTOMER_AUDIT_LOAD_WARN', error.message);
    return [];
  }
  return (data || []) as CustomerAuditLogRow[];
}

export type CustomerAuditDisplayEntry = {
  id: string;
  changedAt: string;
  changedBy: string | null;
  source: string;
  sourceLabel: string;
  field: string;
  fieldLabel: string;
  oldValue: string;
  newValue: string;
};

export function flattenCustomerAuditForDisplay(
  rows: CustomerAuditLogRow[],
): CustomerAuditDisplayEntry[] {
  const out: CustomerAuditDisplayEntry[] = [];
  for (const row of rows) {
    const oldSnap = (row.old_data || {}) as Record<string, unknown>;
    const newSnap = (row.new_data || {}) as Record<string, unknown>;
    const changes = extractCustomerAuditChanges(oldSnap, newSnap);
    for (const change of changes) {
      out.push({
        id: `${row.id}-${change.field}`,
        changedAt: row.changed_at,
        changedBy: row.changed_by,
        source: row.source,
        sourceLabel: formatCustomerAuditSource(row.source),
        field: change.field,
        fieldLabel: change.label,
        oldValue: change.oldValue,
        newValue: change.newValue,
      });
    }
  }
  return out.sort(
    (a, b) =>
      new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime(),
  );
}
