import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { getSaasBillingReminderStats } from '@/lib/saasBillingReminders';
import { isSaasBillingEmailConfigured } from '@/lib/saasBillingReminderEmail';
import { isSaasBillingWhatsAppConfigured } from '@/lib/saasBillingReminderWhatsApp';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const auth = await assertSuperAdmin(supabaseAdmin, searchParams.get('userId'));
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  try {
    const stats = await getSaasBillingReminderStats(supabaseAdmin);
    return NextResponse.json({
      stats,
      emailConfigured: isSaasBillingEmailConfigured(),
      whatsappConfigured: isSaasBillingWhatsAppConfigured(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao carregar estatísticas';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
