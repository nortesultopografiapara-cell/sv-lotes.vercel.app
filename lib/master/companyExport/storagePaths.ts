import {
  COMPANY_EXPORT_BUCKET,
  COMPANY_EXPORT_RETENTION_DAYS,
} from '@/lib/master/companyExport/types';

export function exportStagingPrefix(companyId: string, exportId: string): string {
  return `${companyId}/${exportId}/staging`;
}

export function exportPackagePath(companyId: string, exportId: string): string {
  return `${companyId}/${exportId}/package.zip`;
}

export function exportStagingFilePath(
  companyId: string,
  exportId: string,
  relativePath: string,
): string {
  const safe = relativePath.replace(/^\/+/, '').replace(/\\/g, '/');
  return `${exportStagingPrefix(companyId, exportId)}/${safe}`;
}

export function defaultExpiresAt(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + COMPANY_EXPORT_RETENTION_DAYS);
  return d;
}

export { COMPANY_EXPORT_BUCKET };
