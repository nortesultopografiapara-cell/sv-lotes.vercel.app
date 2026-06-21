import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { getSaasCashStartAt } from '@/lib/saasFinanceSettings';
import { loadSaasCashView, reprocessSaasCashForPaidCharges } from '@/lib/saasCashMovements';

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

    const fromDate = String(body.fromDate || '').split('T')[0] || undefined;
    const toDate = String(body.toDate || '').split('T')[0] || undefined;
    const cashStartAt = await getSaasCashStartAt(supabaseAdmin);

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
      reprocess,
      ...view,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro ao reprocessar cobranças pagas';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
