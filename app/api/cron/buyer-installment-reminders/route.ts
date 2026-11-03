/**
 * Cron de lembretes automáticos ao comprador.
 * Agenda em vercel.json (`10,40 11-22 * * *` UTC = 8:10–19:40 BRT).
 * Só envia para empresas com company_buyer_reminder_settings.enabled = true.
 */

import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import { describeCronAuthFailure, isCronSecretValid } from '@/lib/saasCronAuth';
import { runBuyerInstallmentReminders } from '@/lib/charges/buyerReminderRunner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function handle(request: Request) {
  if (!isCronSecretValid(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', detail: describeCronAuthFailure() },
      { status: 401 },
    );
  }

  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  try {
    const result = await runBuyerInstallmentReminders(supabaseAdmin, { dryRun: false });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro nos lembretes do comprador.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
