/**
 * Deny-list de segurança — nunca exportar estes campos/tabelas.
 */

export const COMPANY_EXPORT_FORBIDDEN_TABLES = [
  'bank_credentials',
  'client_portal_otp_challenges',
  'master_corporate_financial_accounts',
  'master_corporate_financial_categories',
  'master_corporate_cost_centers',
  'master_corporate_receivables',
  'master_corporate_payables',
  'master_corporate_cash_movements',
  'master_corporate_asaas_customers',
  'master_corporate_asaas_charges',
  'master_corporate_asaas_webhook_events',
  'master_topography_projects',
  'master_topography_quotes',
  'master_topography_operations',
  'master_topography_equipment',
  'master_saas_invoices',
  'master_saas_payments',
  'saas_cash_movements',
  'saas_finance_settings',
] as const;

/** Campos que nunca podem aparecer em CSV/JSON (case-insensitive match). */
export const COMPANY_EXPORT_FORBIDDEN_FIELDS = [
  'encrypted_payload',
  'api_key',
  'apikey',
  'sandbox_api_key',
  'sandboxapikey',
  'production_api_key',
  'productionapikey',
  'access_token',
  'accesstoken',
  'webhook_secret',
  'webhooksecret',
  'webhook_token',
  'webhooktoken',
  'client_secret',
  'clientsecret',
  'certificate_password',
  'certificatepassword',
  'otp_hash',
  'otp_salt',
  'otp_code',
  'document_hash',
  'signature_token',
  'password',
  'password_hash',
  'hashed_password',
  'refresh_token',
  'provider_token',
  'provider_refresh_token',
  'raw_app_meta_data',
  'raw_user_meta_data',
  'confirmation_token',
  'recovery_token',
  'email_change_token_new',
  'email_change_token_current',
  'reauthentication_token',
  'service_role',
  'service_role_key',
  'asaas_api_key',
] as const;

export const COMPANY_EXPORT_FORBIDDEN_FIELD_SET = new Set(
  COMPANY_EXPORT_FORBIDDEN_FIELDS.map((f) => f.toLowerCase()),
);

export function isForbiddenExportField(fieldName: string): boolean {
  const key = String(fieldName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
  if (!key) return false;
  if (COMPANY_EXPORT_FORBIDDEN_FIELD_SET.has(key)) return true;
  if (key.includes('api_key') || key.includes('apikey')) return true;
  if (key.includes('webhook_secret') || key.includes('webhooksecret')) return true;
  if (key.includes('access_token') || key.includes('accesstoken')) return true;
  if (key.includes('refresh_token') || key.includes('refreshtoken')) return true;
  if (key.includes('provider_token') || key.includes('providertoken')) return true;
  if (key.includes('encrypted_payload')) return true;
  if (key === 'signature_token') return true;
  return false;
}

/** Redige valores sensíveis dentro de JSON blobs. */
export function sanitizeJsonBlob(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(sanitizeJsonBlob);
  if (typeof value !== 'object') {
    if (typeof value === 'string') {
      let s = value;
      s = s.replace(/\$aact_[A-Za-z0-9_]+/g, '[REDACTED_ASAAS_TOKEN]');
      s = s.replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [REDACTED]');
      s = s.replace(/access_token=[^&\s]+/gi, 'access_token=[REDACTED]');
      return s;
    }
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (isForbiddenExportField(k)) {
      out[k] = '[REDACTED]';
      continue;
    }
    out[k] = sanitizeJsonBlob(v);
  }
  return out;
}

export function stripForbiddenColumns<T extends Record<string, unknown>>(
  row: T,
  allowedColumns: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const col of allowedColumns) {
    if (isForbiddenExportField(col)) continue;
    if (!(col in row)) continue;
    const raw = row[col];
    if (raw != null && typeof raw === 'object') {
      out[col] = sanitizeJsonBlob(raw);
    } else if (typeof raw === 'string' && /payload|metadata|raw_/i.test(col)) {
      out[col] = sanitizeJsonBlob(raw);
    } else {
      out[col] = raw;
    }
  }
  return out;
}
