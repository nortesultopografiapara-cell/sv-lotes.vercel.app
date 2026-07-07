import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { getSaasBillingReminderStats } from '@/lib/saasBillingReminders';
import { isSaasBillingEmailConfigured } from '@/lib/saasBillingReminderEmail';
import { isSaasBillingWhatsAppConfigured } from '@/lib/saasBillingReminderWhatsApp';
import { createMasterApiPerfTracker } from '@/lib/masterApiPerfLog';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const perf = createMasterApiPerfTracker('/api/master/saas-billing-reminders', 'GET');

  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    perf.finish();
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const auth = await perf.timeSupabase('auth.assertSuperAdmin', () =>
    assertSuperAdmin(supabaseAdmin, searchParams.get('userId')),
  );
  if (!auth.ok) {
    perf.finish();
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  try {
    const stats = await perf.timeSupabase(
      'lib.getSaasBillingReminderStats',
      () => getSaasBillingReminderStats(supabaseAdmin),
      (rows) => rows.length,
    );
    const response = perf.timeProcess('process.config_flags', () => ({
      stats,
      emailConfigured: isSaasBillingEmailConfigured(),
      whatsappConfigured: isSaasBillingWhatsAppConfigured(),
    }));
    perf.finish(stats.length);
    return NextResponse.json(response);
  } catch (err) {
    perf.finish();
    const message = err instanceof Error ? err.message : 'Erro ao carregar estatísticas';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
