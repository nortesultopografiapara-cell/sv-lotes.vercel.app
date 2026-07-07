import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { getSaasCashStartAt } from '@/lib/saasFinanceSettings';
import {
  backfillSaasCashForPaidCharges,
  loadSaasCashView,
  syncAsaasCashMovements,
} from '@/lib/saasCashMovements';

export const runtime = 'nodejs';
export const maxDuration = 300;

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

    const cashStartAt = await getSaasCashStartAt(supabaseAdmin);

    const syncResult = await syncAsaasCashMovements(supabaseAdmin, {
      fromDate,
      toDate,
      createdBy: body.userId,
      cashStartAt,
    });

    const backfill = await backfillSaasCashForPaidCharges(supabaseAdmin, {
      fromDate,
      toDate,
      companyId: body.companyId || undefined,
      createdBy: body.userId,
      cashStartAt,
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
      sync: syncResult,
      backfill,
      movements: view.movements,
      summary: view.summary,
      cashStartAt: view.cashStartAt,
      hiddenByMarco: view.hiddenByMarco,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro ao sincronizar Asaas';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
