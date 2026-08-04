/**
 * Cópia de binários Storage → staging company-exports (F2).
 */

import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { COMPANY_EXPORT_BUCKET } from '@/lib/master/companyExport/types';
import { exportStagingFilePath } from '@/lib/master/companyExport/storagePaths';
import type { StorageInventoryItem } from '@/lib/master/companyExport/storageInventory';
import { isAllowedExportBucket } from '@/lib/master/companyExport/storageRegistry';

export type CopyResult = {
  item: StorageInventoryItem;
  ok: boolean;
  missing: boolean;
  bytes: number;
  checksum: string | null;
  error?: string;
};

export async function copyInventoryItemToStaging(
  admin: SupabaseClient,
  companyId: string,
  exportId: string,
  item: StorageInventoryItem,
): Promise<CopyResult> {
  if (item.externalReferenceOnly || !item.bucket) {
    return {
      item: { ...item, status: 'skipped_external' },
      ok: true,
      missing: false,
      bytes: 0,
      checksum: null,
    };
  }
  if (!isAllowedExportBucket(item.bucket)) {
    return {
      item: { ...item, status: 'unresolved' },
      ok: false,
      missing: false,
      bytes: 0,
      checksum: null,
      error: 'bucket não autorizado',
    };
  }

  const { data, error } = await admin.storage.from(item.bucket).download(item.sourcePath);
  if (error || !data) {
    return {
      item: { ...item, status: 'missing' },
      ok: false,
      missing: true,
      bytes: 0,
      checksum: null,
      error: error?.message || 'download falhou',
    };
  }

  const buf = Buffer.from(await data.arrayBuffer());
  const checksum = createHash('sha256').update(buf).digest('hex');
  const dest = exportStagingFilePath(companyId, exportId, item.destinationPath);
  const contentType = item.mimeType || 'application/octet-stream';
  const { error: upErr } = await admin.storage.from(COMPANY_EXPORT_BUCKET).upload(dest, buf, {
    contentType,
    upsert: true,
  });
  if (upErr) {
    return {
      item: { ...item, status: 'missing' },
      ok: false,
      missing: false,
      bytes: 0,
      checksum: null,
      error: upErr.message,
    };
  }

  return {
    item: { ...item, status: 'copied', size: buf.length },
    ok: true,
    missing: false,
    bytes: buf.length,
    checksum,
  };
}

export async function uploadBinaryToStaging(
  admin: SupabaseClient,
  companyId: string,
  exportId: string,
  relativePath: string,
  body: Buffer,
  contentType: string,
): Promise<{ ok: boolean; size: number; checksum: string; error?: string }> {
  const checksum = createHash('sha256').update(body).digest('hex');
  const path = exportStagingFilePath(companyId, exportId, relativePath);
  const { error } = await admin.storage.from(COMPANY_EXPORT_BUCKET).upload(path, body, {
    contentType,
    upsert: true,
  });
  if (error) return { ok: false, size: 0, checksum, error: error.message };
  return { ok: true, size: body.length, checksum };
}
