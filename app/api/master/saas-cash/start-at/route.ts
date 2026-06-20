import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { getSaasCashStartAt, setSaasCashStartAt } from '@/lib/saasFinanceSettings';
import { loadSaasCashView } from '@/lib/saasCashMovements';

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

    const cashStartAt = await setSaasCashStartAt(supabaseAdmin, {
      at: body.startAt || undefined,
      userId: body.userId,
    });

    const fromDate = String(body.fromDate || '').split('T')[0] || undefined;
    const toDate = String(body.toDate || '').split('T')[0] || undefined;
    const view = await loadSaasCashView(
      supabaseAdmin,
      {
        companyId: body.companyId || undefined,
        type: body.type || 'all',
        fromDate,
        toDate,
      },
      cashStartAt,
    );

    return NextResponse.json({
      success: true,
      cashStartAt,
      ...view,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro ao definir marco inicial';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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

  const cashStartAt = await getSaasCashStartAt(supabaseAdmin);
  return NextResponse.json({ cashStartAt });
}
