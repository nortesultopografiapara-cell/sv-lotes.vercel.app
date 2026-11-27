import { authorizePlatformAdminRequest } from '@/lib/security/adminAuthorization';
import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import { syncMissingSaasSubscriptions } from '@/lib/saasSubscriptionService';

export async function POST(request: Request) {
  
  try {
    const body = await request.json().catch(() => ({}));
    const auth = await authorizePlatformAdminRequest(request, body.userId);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
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
