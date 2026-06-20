import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { getSaasCashStartAt } from '@/lib/saasFinanceSettings';
import { loadSaasCashView } from '@/lib/saasCashMovements';

export const runtime = 'nodejs';

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
    const companyId = searchParams.get('companyId') || undefined;
    const type = (searchParams.get('type') || 'all') as 'income' | 'expense' | 'all';
    const fromDate = searchParams.get('fromDate') || undefined;
    const toDate = searchParams.get('toDate') || undefined;
    const cashStartAt = await getSaasCashStartAt(supabaseAdmin);

    const view = await loadSaasCashView(
      supabaseAdmin,
      { companyId, type, fromDate, toDate },
      cashStartAt,
    );

    return NextResponse.json(view);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro ao carregar caixa SaaS';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
