import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { diagnoseMasterAuditLogs, loadMasterAuditLogs } from '@/lib/masterAuditLoad';

function isDevelopDiagnosticsEnabled(): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') return true;
  if (process.env.VERCEL_GIT_COMMIT_REF === 'develop') return true;
  return false;
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  console.log('[master-audit] start');

  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    console.log(`[master-audit] total_ms=${Date.now() - startedAt}`);
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  const auth = await assertSuperAdmin(supabaseAdmin, userId);
  if (!auth.ok) {
    console.log(`[master-audit] total_ms=${Date.now() - startedAt}`);
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  if (searchParams.get('diagnostics') === '1') {
    if (!isDevelopDiagnosticsEnabled()) {
      return NextResponse.json({ error: 'Diagnóstico indisponível em produção.' }, { status: 403 });
    }
    const diagnostics = await diagnoseMasterAuditLogs(supabaseAdmin);
    return NextResponse.json({ diagnostics });
  }

  const result = await loadMasterAuditLogs(supabaseAdmin);

  console.log(`[master-audit] logs_query_ms=${result.logsQueryMs}`);
  console.log(`[master-audit] enrich_ms=${result.enrichMs}`);
  console.log(`[master-audit] total_ms=${Date.now() - startedAt}`);
  console.log(`[master-audit] rows=${result.rows.length}`);

  if (result.errors.length > 0 && result.rows.length === 0) {
    return NextResponse.json(
      {
        error: result.errors.join(' · '),
        rawCount: result.rawCount,
        filteredCount: result.filteredCount,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    rows: result.rows,
    warnings: result.errors.length > 0 ? result.errors : undefined,
    rawCount: result.rawCount,
    filteredCount: result.filteredCount,
  });
}
