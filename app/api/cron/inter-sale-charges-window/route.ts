import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import { describeCronAuthFailure, isCronSecretValid } from '@/lib/saasCronAuth';
import { tickWaitingInterResumeWindows } from '@/lib/banking/inter/interSaleChargesResumeService';
import { isInterResumeLiveEmitFlagEnabled } from '@/lib/banking/inter/interResumeLiveEmitFlag';
import { BRAZIL_TIMEZONE, todayBrazilIsoDate } from '@/lib/companySubscriptionDates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CRON_SCHEDULE_UTC = '15 11 * * *';

async function handle(request: Request) {
  if (!isCronSecretValid(request)) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        detail: describeCronAuthFailure(),
        cronScheduleUtc: CRON_SCHEDULE_UTC,
      },
      { status: 401 },
    );
  }
  const { client: admin, error } = createServiceSupabase();
  if (!admin) return NextResponse.json({ error }, { status: 500 });
  try {
    const result = await tickWaitingInterResumeWindows(admin, 4);
    return NextResponse.json({
      ok: true,
      skipped: false,
      cronScheduleUtc: CRON_SCHEDULE_UTC,
      cronScheduleLocalHint: '08:15 America/Sao_Paulo (UTC-3)',
      runTimezone: BRAZIL_TIMEZONE,
      runDateBrazil: todayBrazilIsoDate(),
      liveEmitEnabled: result.liveEmitEnabled,
      emitMode: result.emitMode,
      scanned: result.scanned,
      reopened: result.reopened,
      processed: result.processed,
      flag: isInterResumeLiveEmitFlagEnabled(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro no cron da janela Inter.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
