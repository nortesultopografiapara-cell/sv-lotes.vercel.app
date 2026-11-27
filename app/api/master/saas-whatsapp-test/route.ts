import { authorizePlatformAdminRequest } from '@/lib/security/adminAuthorization';
import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import { sendSaasWhatsAppTest } from '@/lib/saasWhatsAppTest';
import { getZapiConfigStatus, isZapiConfigured } from '@/lib/whatsapp/zapiProvider';

export const runtime = 'nodejs';

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


  const config = getZapiConfigStatus();
  return NextResponse.json({
    whatsappConfigured: isZapiConfigured(),
    config,
  });
}

export async function POST(request: Request) {
  
  try {
    const body = await request.json();
    const auth = await authorizePlatformAdminRequest(request, body.userId);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }


    const phone = String(body.phone || '').trim();
    if (!phone) {
      return NextResponse.json({ error: 'Informe o número para teste.' }, { status: 400 });
    }

    if (!isZapiConfigured()) {
      return NextResponse.json({ error: 'Z-API não configurada.' }, { status: 503 });
    }

    const result = await sendSaasWhatsAppTest(supabaseAdmin, {
      phone,
      actorUserId: String(body.userId),
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error || 'Falha no envio.',
          debug: result.debug ?? null,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      normalizedPhone: result.normalizedPhone,
      messageId: result.messageId ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao enviar teste WhatsApp';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
