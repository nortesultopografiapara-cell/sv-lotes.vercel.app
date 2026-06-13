import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { loadMasterAuditLogs } from '@/lib/masterAuditLoad';

export async function GET(request: Request) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  const auth = await assertSuperAdmin(supabaseAdmin, userId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  try {
    const result = await loadMasterAuditLogs(supabaseAdmin);
    return NextResponse.json({
      rows: result.rows,
      warnings: result.errors,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro ao carregar auditoria';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
