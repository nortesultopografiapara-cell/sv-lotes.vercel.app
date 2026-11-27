import { authorizePlatformAdminRequest } from '@/lib/security/adminAuthorization';
import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import { isSaasBillingEmailConfigured } from '@/lib/saasBillingReminderEmail';
import { isSaasBillingWhatsAppConfigured } from '@/lib/saasBillingReminderWhatsApp';
import { getSaasPaymentGatewayStatus } from '@/lib/saasPaymentGateway';

export const runtime = 'nodejs';

/** Status leve das integrações Master — sem consultas pesadas ao banco. */
export async function GET(request: Request) {
  
  const { searchParams } = new URL(request.url);
  const auth = await authorizePlatformAdminRequest(request, searchParams.get('userId'));
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }


  const webhookConfigured = !!String(process.env.ASAAS_WEBHOOK_TOKEN || '').trim();

  return NextResponse.json({
    gateway: getSaasPaymentGatewayStatus(),
    emailConfigured: isSaasBillingEmailConfigured(),
    whatsappConfigured: isSaasBillingWhatsAppConfigured(),
    webhookConfigured,
    smtpConfigured: isSaasBillingEmailConfigured(),
  });
}
