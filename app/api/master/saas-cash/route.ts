import { authorizePlatformAdminRequest } from '@/lib/security/adminAuthorization';
import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { getSaasCashStartAt } from '@/lib/saasFinanceSettings';
import { loadSaasCashView } from '@/lib/saasCashMovements';
import { createMasterApiPerfTracker } from '@/lib/masterApiPerfLog';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const perf = createMasterApiPerfTracker('/api/master/saas-cash', 'GET');

  
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const auth = await perf.timeSupabase('auth.assertSuperAdmin', () =>
    authorizePlatformAdminRequest(request, userId),
  );
  if (!auth.ok) {
    perf.finish();
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    perf.finish();
    return NextResponse.json({ error: configError }, { status: 500 });
  }


  try {
    const companyId = searchParams.get('companyId') || undefined;
    const type = (searchParams.get('type') || 'all') as
      | 'income'
      | 'expense'
      | 'transfer'
      | 'all';
    const fromDate = searchParams.get('fromDate') || undefined;
    const toDate = searchParams.get('toDate') || undefined;
    const cashStartAt = await perf.timeSupabase('lib.getSaasCashStartAt', () =>
      getSaasCashStartAt(supabaseAdmin),
    );

    const view = await perf.timeSupabase(
      'lib.loadSaasCashView',
      () =>
        loadSaasCashView(
          supabaseAdmin,
          { companyId, type, fromDate, toDate },
          cashStartAt,
          { enabled: false, createdBy: userId ?? undefined },
        ),
      (result) => result.movements.length,
    );

    perf.finish(view.movements.length);
    return NextResponse.json(view);
  } catch (e: unknown) {
    perf.finish();
    const message = e instanceof Error ? e.message : 'Erro ao carregar caixa SaaS';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
