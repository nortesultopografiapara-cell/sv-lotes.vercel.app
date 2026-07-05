import { NextResponse } from 'next/server';
import { authorizeDataMigrationRequest } from '@/lib/imports/apiAuth';
import { resolveMigrationTypeLabel } from '@/lib/imports/services/migrationHistory';
import type { ImportModuleId, MigrationHistoryRow } from '@/lib/imports/types';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const activeTenantId = new URL(request.url).searchParams.get('activeTenantId');
  const auth = await authorizeDataMigrationRequest(request, activeTenantId);
  if ('error' in auth) return auth.error;

  const { data, error } = await auth.ctx.admin
    .from('data_migration_history')
    .select(
      'id, migrated_at, tipo, arquivo, usuario, quantidade_importada, status, created_at',
    )
    .eq('company_id', auth.ctx.tenantId)
    .order('migrated_at', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows: MigrationHistoryRow[] = (data || []).map((row) => ({
    id: row.id,
    date: row.migrated_at || row.created_at,
    type: row.tipo as ImportModuleId,
    typeLabel: resolveMigrationTypeLabel(row.tipo as ImportModuleId),
    fileName: row.arquivo,
    userName: row.usuario || '—',
    quantity: row.quantidade_importada,
    status: row.status,
  }));

  return NextResponse.json({ rows });
}
