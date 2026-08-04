import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import { describeCronAuthFailure, isCronSecretValid } from '@/lib/saasCronAuth';
import { runCompanyExportWorker } from '@/lib/master/companyExport/jobService';

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
    // Multiple ticks per invocation to advance a job faster within 60s
    let processed = 0;
    let completed = 0;
    let failed = 0;
    for (let i = 0; i < 8; i++) {
      const result = await runCompanyExportWorker(admin, 1);
      processed += result.processed;
      completed += result.completed;
      failed += result.failed;
      if (result.processed === 0) break;
      if (result.completed > 0 || result.failed > 0) {
        // continue to drain other pending jobs / next steps
      }
    }
    return NextResponse.json({ ok: true, processed, completed, failed });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro no worker';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
