import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  getSaasCashSummary,
  listSaasCashMovements,
  syncAsaasCashMovements,
} from '@/lib/saasCashMovements';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  try {
    const body = await request.json();
    const auth = await assertSuperAdmin(supabaseAdmin, body.userId);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const fromDate = String(body.fromDate || '').split('T')[0];
    const toDate = String(body.toDate || '').split('T')[0];
    if (!fromDate || !toDate) {
      return NextResponse.json(
        { error: 'fromDate e toDate são obrigatórios.' },
        { status: 400 },
      );
    }

    const syncResult = await syncAsaasCashMovements(supabaseAdmin, {
      fromDate,
      toDate,
      createdBy: body.userId,
    });

    const [movements, summary] = await Promise.all([
      listSaasCashMovements(supabaseAdmin, {
        companyId: body.companyId || undefined,
        type: body.type || 'all',
        fromDate,
        toDate,
      }),
      getSaasCashSummary(supabaseAdmin, {
        companyId: body.companyId || undefined,
        fromDate,
        toDate,
      }),
    ]);

    return NextResponse.json({
      success: true,
      sync: syncResult,
      movements,
      summary,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro ao sincronizar Asaas';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
