import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyExportReason } from '@/lib/master/companyExport/types';

export async function logCompanyExportAudit(
  admin: SupabaseClient,
  input: {
    companyId: string;
    userId: string;
    action: string;
    description: string;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await admin.from('audit_logs').insert({
      tenant_id: input.companyId,
      company_id: input.companyId,
      user_id: input.userId,
      action: input.action,
      module: 'COMPANIES',
      description: input.description,
      details: JSON.stringify(input.details || {}),
    });
  } catch (err) {
    console.error('[company-export] audit insert failed', err);
  }
}

export const COMPANY_EXPORT_AUDIT = {
  CREATED: 'COMPANY_DATA_EXPORT_CREATED',
  COMPLETED: 'COMPANY_DATA_EXPORT_COMPLETED',
  FAILED: 'COMPANY_DATA_EXPORT_FAILED',
  CANCELLED: 'COMPANY_DATA_EXPORT_CANCELLED',
  DOWNLOAD: 'COMPANY_DATA_EXPORT_DOWNLOAD',
  FILE_DELETED: 'COMPANY_DATA_EXPORT_FILE_DELETED',
  EXPIRED: 'COMPANY_DATA_EXPORT_EXPIRED',
} as const;

export function reasonLabel(reason: CompanyExportReason): string {
  switch (reason) {
    case 'OFFBOARDING':
      return 'Encerramento / offboarding';
    case 'CLIENT_REQUEST':
      return 'Solicitação do cliente';
    case 'MIGRATION':
      return 'Migração de sistema';
    case 'BACKUP':
      return 'Backup formal';
    default:
      return 'Outro';
  }
}
