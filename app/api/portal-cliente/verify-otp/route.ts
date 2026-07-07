import { NextRequest, NextResponse } from 'next/server';
import { isValidBrazilianTaxDocument, onlyDigits } from '@/lib/inputMasks';
import { isClientPortalEnabled } from '@/lib/portal-cliente/config';
import { hashClientPortalDocument } from '@/lib/portal-cliente/otp';
import { verifyClientPortalOtp } from '@/lib/portal-cliente/otpStore';
import {
  clearClientPortalOtpChallengeCookie,
  createClientPortalSessionToken,
  getClientPortalOtpChallengeCookie,
  readClientPortalOtpChallengeToken,
  setClientPortalSessionCookie,
} from '@/lib/portal-cliente/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type VerifyOtpBody = {
  cpf_cnpj?: string;
  linkKey?: string;
  code?: string;
};

export async function POST(request: NextRequest) {
  if (!isClientPortalEnabled()) {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }

  let body: VerifyOtpBody;
  try {
    body = (await request.json()) as VerifyOtpBody;
  } catch {
    return NextResponse.json({ ok: false, message: 'Requisição inválida.' }, { status: 400 });
  }

  const documentDigits = onlyDigits(body.cpf_cnpj);
  const linkKey = String(body.linkKey || '').trim();
  const code = String(body.code || '').trim();

  if (!isValidBrazilianTaxDocument(documentDigits) || !linkKey || !code) {
    return NextResponse.json({ ok: false, message: 'Dados inválidos.' }, { status: 400 });
  }

  const challengeCookie = await getClientPortalOtpChallengeCookie();
  if (!challengeCookie) {
    return NextResponse.json(
      { ok: false, message: 'Sessão de confirmação expirada. Solicite um novo código.' },
      { status: 401 },
    );
  }

  const challenge = readClientPortalOtpChallengeToken(challengeCookie);
  if (!challenge) {
    await clearClientPortalOtpChallengeCookie();
    return NextResponse.json(
      { ok: false, message: 'Sessão de confirmação expirada. Solicite um novo código.' },
      { status: 401 },
    );
  }

  const documentHash = hashClientPortalDocument(documentDigits);
  if (challenge.linkKey !== linkKey || challenge.documentHash !== documentHash) {
    return NextResponse.json({ ok: false, message: 'Dados de confirmação inválidos.' }, { status: 400 });
  }

  const verifyResult = await verifyClientPortalOtp({
    challengeId: challenge.challengeId,
    linkKey,
    documentDigits,
    code,
  });

  if (!verifyResult.ok) {
    return NextResponse.json(
      { ok: false, code: verifyResult.code, message: verifyResult.message },
      { status: verifyResult.code === 'ATTEMPTS_EXCEEDED' ? 429 : 400 },
    );
  }

  const sessionToken = createClientPortalSessionToken({
    linkKey: verifyResult.linkKey,
    documentHash: verifyResult.documentHash,
    verifiedAt: new Date().toISOString(),
  });

  await setClientPortalSessionCookie(sessionToken);
  await clearClientPortalOtpChallengeCookie();

  return NextResponse.json({
    ok: true,
    message: 'Acesso confirmado com sucesso.',
  });
}
