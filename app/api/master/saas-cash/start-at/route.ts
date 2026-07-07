import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  getSaasCashStartAt,
  parseSaasCashStartAtInput,
  setSaasCashStartAt,
} from '@/lib/saasFinanceSettings';
import { loadSaasCashView, reprocessSaasCashForPaidCharges } from '@/lib/saasCashMovements';
import { createMasterApiPerfTracker } from '@/lib/masterApiPerfLog';

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

    const startAtIso = body.startAt
      ? parseSaasCashStartAtInput(String(body.startAt))
      : new Date().toISOString();

    const cashStartAt = await setSaasCashStartAt(supabaseAdmin, {
      at: startAtIso,
      userId: body.userId,
    });

    const fromDate = String(body.fromDate || '').split('T')[0] || undefined;
    const toDate = String(body.toDate || '').split('T')[0] || undefined;

    const reprocess = await reprocessSaasCashForPaidCharges(supabaseAdmin, {
      fromDate,
      toDate,
      companyId: body.companyId || undefined,
      createdBy: body.userId,
      cashStartAt,
      syncAsaas: body.syncAsaas !== false,
    });

    const view = await loadSaasCashView(
      supabaseAdmin,
      {
        companyId: body.companyId || undefined,
        type: body.type || 'all',
        fromDate,
        toDate,
      },
      cashStartAt,
      { enabled: false },
    );

    return NextResponse.json({
      success: true,
      cashStartAt,
      reprocess,
      movements: view.movements,
      summary: view.summary,
      hiddenByMarco: view.hiddenByMarco,
      backfill: reprocess.backfill,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro ao definir marco inicial';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const perf = createMasterApiPerfTracker('/api/master/saas-cash/start-at', 'GET');

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

  const cashStartAt = await perf.timeSupabase('lib.getSaasCashStartAt', () =>
    getSaasCashStartAt(supabaseAdmin),
  );
  perf.finish();
  return NextResponse.json({ cashStartAt });
}
