import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import { describeCronAuthFailure, isCronSecretValid } from '@/lib/saasCronAuth';
import { tickDueInterResumeJobs } from '@/lib/banking/inter/interSaleChargesResumeService';
import { isInterResumeLiveEmitFlagEnabled } from '@/lib/banking/inter/interResumeLiveEmitFlag';

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
  const { client: admin, error } = createServiceSupabase();
  if (!admin) return NextResponse.json({ error }, { status: 500 });
  try {
    const result = await tickDueInterResumeJobs(admin, 4);
    return NextResponse.json({
      ok: true,
      skipped: false,
      liveEmitEnabled: result.liveEmitEnabled,
      emitMode: result.emitMode,
      processed: result.processed,
      flag: isInterResumeLiveEmitFlagEnabled(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro no cron Inter resume.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
