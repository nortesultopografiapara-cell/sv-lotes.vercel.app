import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import { isCronSecretValid } from '@/lib/saasCronAuth';
import { runSaasBillingReminders } from '@/lib/saasBillingReminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function handleCron(request: Request) {
  if (!isCronSecretValid(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  try {
    const result = await runSaasBillingReminders(supabaseAdmin);
    return NextResponse.json({ success: true, ...result });
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
