import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import { logSignatureEvent } from '@/lib/signatureEventService';
import {
  resolvePublicSignatureValidation,
  resolveSignatureSourceByToken,
} from '@/lib/signatureVerifyService';
import { resolveClientIp } from '@/lib/saasContractSignatureService';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { token } = await params;
  const payload = await resolvePublicSignatureValidation(supabaseAdmin, token);
  if (!payload) {
    return NextResponse.json({ error: 'Token de validação inválido.' }, { status: 404 });
  }

  const source = await resolveSignatureSourceByToken(supabaseAdmin, token);
  const url = new URL(request.url);
  const fromQr = url.searchParams.get('qr') === '1';

  await logSignatureEvent(supabaseAdmin, {
    signatureToken: token,
    signatureSource: source || 'SALE',
    eventType: fromQr ? 'QR_VALIDATED' : 'PAGE_ACCESSED',
    ipAddress: resolveClientIp(request),
    userAgent: request.headers.get('user-agent'),
    eventDescription: fromQr
      ? 'Documento validado publicamente via QR Code.'
      : 'Página pública de validação acessada.',
  });

  return NextResponse.json(payload);
}
