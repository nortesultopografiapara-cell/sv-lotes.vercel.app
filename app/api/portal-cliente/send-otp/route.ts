import { NextRequest, NextResponse } from 'next/server';
import { resolveClientPortalLinkContext } from '@/lib/clientPortalLookup';
import { isValidBrazilianTaxDocument, onlyDigits } from '@/lib/inputMasks';
import { isClientPortalEnabled } from '@/lib/portal-cliente/config';
import { hashClientPortalDocument } from '@/lib/portal-cliente/otp';
import { createAndSendClientPortalOtp } from '@/lib/portal-cliente/otpStore';
import {
  createClientPortalOtpChallengeToken,
  setClientPortalOtpChallengeCookie,
} from '@/lib/portal-cliente/session';

export const dynamic = 'force-dynamic';

type SendOtpBody = {
  cpf_cnpj?: string;
  linkKey?: string;
  resend?: boolean;
};

export async function POST(request: NextRequest) {
  if (!isClientPortalEnabled()) {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }

  let body: SendOtpBody;
  try {
    body = (await request.json()) as SendOtpBody;
  } catch {
    return NextResponse.json({ ok: false, message: 'Requisição inválida.' }, { status: 400 });
  }

  const documentDigits = onlyDigits(body.cpf_cnpj);
  const linkKey = String(body.linkKey || '').trim();

  if (!isValidBrazilianTaxDocument(documentDigits) || !linkKey) {
    return NextResponse.json({ ok: false, message: 'Dados inválidos.' }, { status: 400 });
  }

  const context = await resolveClientPortalLinkContext(documentDigits, linkKey);
  if (!context) {
    return NextResponse.json({ ok: false, message: 'Vínculo não encontrado.' }, { status: 404 });
  }

  const phone = String(context.phone || '').trim();
  if (!phone) {
    return NextResponse.json(
      {
        ok: false,
        message: 'Não há WhatsApp cadastrado para este vínculo. Entre em contato com a loteadora.',
      },
      { status: 422 },
    );
  }

  const sendResult = await createAndSendClientPortalOtp({
    linkKey,
    documentDigits,
    phone,
    phoneMasked: context.phoneMasked,
    resend: body.resend === true,
  });

  if (!sendResult.ok) {
    return NextResponse.json(
      { ok: false, code: sendResult.code, message: sendResult.message },
      { status: sendResult.code === 'WHATSAPP_FAILED' ? 502 : 429 },
    );
  }

  const challengeToken = createClientPortalOtpChallengeToken({
    challengeId: sendResult.challengeId,
    linkKey,
    documentHash: hashClientPortalDocument(documentDigits),
    phoneMasked: sendResult.phoneMasked,
    issuedAt: new Date().toISOString(),
  });

  await setClientPortalOtpChallengeCookie(challengeToken);

  return NextResponse.json({
    ok: true,
    phoneMasked: sendResult.phoneMasked,
  });
}
