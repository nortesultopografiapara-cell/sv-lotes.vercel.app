import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  loadMasterAuditLogs,
  MASTER_AUDIT_QUERY_TIMEOUT_MS,
} from '@/lib/masterAuditLoad';

export async function GET(request: Request) {
  const startedAt = Date.now();
  console.log('[master-audit] start');

  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    console.log(`[master-audit] total_ms=${Date.now() - startedAt}`);
    console.log('[master-audit] rows=0');
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  const auth = await assertSuperAdmin(supabaseAdmin, userId);
  if (!auth.ok) {
    console.log(`[master-audit] total_ms=${Date.now() - startedAt}`);
    console.log('[master-audit] rows=0');
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  try {
    const result = await loadMasterAuditLogs(supabaseAdmin, {
      queryTimeoutMs: MASTER_AUDIT_QUERY_TIMEOUT_MS,
    });

    console.log(`[master-audit] logs_query_ms=${result.logsQueryMs}`);
    console.log(`[master-audit] enrich_ms=${result.enrichMs}`);
    console.log(`[master-audit] total_ms=${Date.now() - startedAt}`);
    console.log(`[master-audit] rows=${result.rows.length}`);

    return NextResponse.json({
      rows: result.rows,
      warnings: result.errors,
      rawCount: result.rawCount,
      filteredCount: result.filteredCount,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro ao carregar auditoria';
    console.log(`[master-audit] logs_query_ms=${Date.now() - startedAt}`);
    console.log('[master-audit] enrich_ms=0');
    console.log(`[master-audit] total_ms=${Date.now() - startedAt}`);
    console.log('[master-audit] rows=0');
    console.error('[master-audit] error', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
