import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  diagnoseMasterAuditLogs,
  loadMasterAuditLogs,
  MasterAuditLoadError,
  MASTER_AUDIT_QUERY_LOG,
} from '@/lib/masterAuditLoad';

function isDevelopDiagnosticsEnabled(): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') return true;
  if (process.env.VERCEL_GIT_COMMIT_REF === 'develop') return true;
  return false;
}

export async function GET(request: Request) {
  console.time('[audit] total');
  console.log('[audit] route start');

  try {
    console.time('[audit] service');
    const { client: supabaseAdmin, error: configError } = createServiceSupabase();
    console.timeEnd('[audit] service');

    if (!supabaseAdmin) {
      console.timeEnd('[audit] total');
      return NextResponse.json(
        { error: configError || 'Service role não configurada.' },
        { status: 500 },
      );
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    console.time('[audit] auth');
    const auth = await assertSuperAdmin(supabaseAdmin, userId);
    console.timeEnd('[audit] auth');

    if (!auth.ok) {
      console.timeEnd('[audit] total');
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    if (searchParams.get('diagnostics') === '1') {
      if (!isDevelopDiagnosticsEnabled()) {
        console.timeEnd('[audit] total');
        return NextResponse.json({ error: 'Diagnóstico indisponível em produção.' }, { status: 403 });
      }
      const diagnostics = await diagnoseMasterAuditLogs(supabaseAdmin);
      console.timeEnd('[audit] total');
      return NextResponse.json({ diagnostics });
    }

    const result = await loadMasterAuditLogs(supabaseAdmin);

    console.log('[audit] timing', {
      query_ms: result.logsQueryMs,
      enrich_ms: result.enrichMs,
      rows: result.rows.length,
      sql: MASTER_AUDIT_QUERY_LOG.replace(/\s+/g, ' ').trim(),
    });
    console.timeEnd('[audit] total');

    return NextResponse.json({
      rows: result.rows,
      warnings: result.errors.length > 0 ? result.errors : undefined,
      rawCount: result.rawCount,
      filteredCount: result.filteredCount,
    });
  } catch (err) {
    console.timeEnd('[audit] total');

    if (err instanceof MasterAuditLoadError) {
      return NextResponse.json(
        {
          error: err.message,
          stage: err.stage,
        },
        { status: 500 },
      );
    }

    const message = err instanceof Error ? err.message : 'Falha ao carregar auditoria';
    console.error('[audit] unhandled', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
