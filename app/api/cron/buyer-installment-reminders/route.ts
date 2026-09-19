import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import { describeCronAuthFailure, isCronSecretValid } from '@/lib/saasCronAuth';
import {
  buyerRemindersProductionBlockedReason,
  runBuyerInstallmentReminders,
} from '@/lib/charges/buyerReminderRunner';
import { BUYER_REMINDER_TIMEZONE } from '@/lib/charges/buyerReminderTypes';
import { todayBrazilIsoDate } from '@/lib/companySubscriptionDates';

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

  const blocked = buyerRemindersProductionBlockedReason();
  if (blocked) {
    return NextResponse.json({
      skipped: true,
      reason: 'production_blocked',
      message: blocked,
      timezone: BUYER_REMINDER_TIMEZONE,
      runDateBrazil: todayBrazilIsoDate(),
    });
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
