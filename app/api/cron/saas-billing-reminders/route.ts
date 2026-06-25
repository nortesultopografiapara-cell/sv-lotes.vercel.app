import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import { BRAZIL_TIMEZONE, todayBrazilIsoDate } from '@/lib/companySubscriptionDates';
import { describeCronAuthFailure, isCronSecretValid } from '@/lib/saasCronAuth';
import { runSaasBillingReminders } from '@/lib/saasBillingReminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CRON_SCHEDULE_UTC = '0 11 * * *';

async function handleCron(request: Request) {
  if (!isCronSecretValid(request)) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        detail: describeCronAuthFailure(),
        cronScheduleUtc: CRON_SCHEDULE_UTC,
        cronScheduleLocalHint: '08:00 America/Sao_Paulo (UTC-3)',
      },
      { status: 401 },
    );
  }

  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  try {
    const result = await runSaasBillingReminders(supabaseAdmin);
    return NextResponse.json({
      success: true,
      cronScheduleUtc: CRON_SCHEDULE_UTC,
      cronScheduleLocalHint: '08:00 America/Sao_Paulo (UTC-3)',
      runTimezone: BRAZIL_TIMEZONE,
      runDateBrazil: todayBrazilIsoDate(),
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao executar lembretes SaaS';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleCron(request);
}

export async function POST(request: Request) {
  return handleCron(request);
}
