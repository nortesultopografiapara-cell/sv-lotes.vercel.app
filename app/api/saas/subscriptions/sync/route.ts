import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { syncMissingSaasSubscriptions } from '@/lib/saasSubscriptionService';

export async function POST(request: Request) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const auth = await assertSuperAdmin(supabaseAdmin, body.userId);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const result = await syncMissingSaasSubscriptions(supabaseAdmin);

    return NextResponse.json({
      success: true,
      created: result.created,
      subscriptions: result.subscriptions,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
