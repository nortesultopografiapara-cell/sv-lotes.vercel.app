import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { loadMasterAuditLogs } from '@/lib/masterAuditLoad';
import { createMasterApiPerfTracker } from '@/lib/masterApiPerfLog';

export async function GET(request: Request) {
  const perf = createMasterApiPerfTracker('/api/master/audit', 'GET');

  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    perf.finish();
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  const auth = await perf.timeSupabase('auth.assertSuperAdmin', () =>
    assertSuperAdmin(supabaseAdmin, userId),
  );
  if (!auth.ok) {
    perf.finish();
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  try {
    const result = await perf.timeSupabase(
      'lib.loadMasterAuditLogs',
      () => loadMasterAuditLogs(supabaseAdmin),
      (value) => value.rows.length,
    );
    perf.finish(result.rows.length);
    return NextResponse.json({
      rows: result.rows,
      warnings: result.errors,
    });
  } catch (e: unknown) {
    perf.finish();
    const message = e instanceof Error ? e.message : 'Erro ao carregar auditoria';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
