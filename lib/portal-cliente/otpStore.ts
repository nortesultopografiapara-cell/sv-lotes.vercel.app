/**
 * Persistência OTP do Portal do Cliente — somente via service role.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildClientPortalOtpExpiresAt,
  CLIENT_PORTAL_OTP_MAX_ATTEMPTS,
  CLIENT_PORTAL_OTP_MAX_RESENDS,
  CLIENT_PORTAL_OTP_RESEND_COOLDOWN_MS,
  createClientPortalOtpSalt,
  generateClientPortalOtpCode,
  hashClientPortalDocument,
  hashClientPortalOtp,
  isClientPortalOtpExpired,
  isValidClientPortalOtpInput,
  normalizeOtpInput,
  verifyClientPortalOtpCode,
} from '@/lib/portal-cliente/otp';
import { sendClientPortalOtpWhatsApp } from '@/lib/portal-cliente/whatsapp';
import { createAdminSupabase } from '@/lib/supabase/server';

export type ClientPortalOtpChallengeRow = {
  id: string;
  link_key: string;
  document_hash: string;
  otp_hash: string;
  otp_salt: string;
  phone_masked: string | null;
  attempts: number;
  resend_count: number;
  expires_at: string;
  consumed_at: string | null;
  last_sent_at: string;
  created_at: string;
};

export type SendClientPortalOtpResult =
  | { ok: true; phoneMasked: string | null; challengeId: string }
  | { ok: false; code: string; message: string };

export type VerifyClientPortalOtpResult =
  | { ok: true; linkKey: string; documentHash: string }
  | { ok: false; code: string; message: string };

const TABLE = 'client_portal_otp_challenges';

async function getAdmin(adminClient?: SupabaseClient | null) {
  if (adminClient) return adminClient;
  const { client } = createAdminSupabase();
  return client;
}

export async function findActiveOtpChallenge(
  linkKey: string,
  documentHash: string,
  adminClient?: SupabaseClient | null,
): Promise<ClientPortalOtpChallengeRow | null> {
  const admin = await getAdmin(adminClient);
  if (!admin) return null;

  const { data, error } = await admin
    .from(TABLE)
    .select('*')
    .eq('link_key', linkKey)
    .eq('document_hash', documentHash)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[client-portal-otp] find active error', error.message);
    return null;
  }

  return (data as ClientPortalOtpChallengeRow | null) ?? null;
}

export async function createAndSendClientPortalOtp(input: {
  linkKey: string;
  documentDigits: string;
  phone: string;
  phoneMasked: string | null;
  resend?: boolean;
  adminClient?: SupabaseClient | null;
}): Promise<SendClientPortalOtpResult> {
  const admin = await getAdmin(input.adminClient);
  if (!admin) {
    return { ok: false, code: 'CONFIG_ERROR', message: 'Serviço indisponível.' };
  }

  const documentHash = hashClientPortalDocument(input.documentDigits);
  const existing = await findActiveOtpChallenge(input.linkKey, documentHash, admin);

  if (input.resend) {
    if (!existing) {
      return {
        ok: false,
        code: 'CHALLENGE_NOT_FOUND',
        message: 'Solicite um novo código a partir do início.',
      };
    }
    if (isClientPortalOtpExpired(existing.expires_at)) {
      return {
        ok: false,
        code: 'OTP_EXPIRED',
        message: 'Código expirado. Volte e solicite um novo acesso.',
      };
    }
    if (existing.resend_count >= CLIENT_PORTAL_OTP_MAX_RESENDS) {
      return {
        ok: false,
        code: 'RESEND_LIMIT',
        message: 'Limite de reenvios atingido. Tente novamente mais tarde.',
      };
    }
    const cooldownMs =
      Date.now() - new Date(existing.last_sent_at).getTime() < CLIENT_PORTAL_OTP_RESEND_COOLDOWN_MS;
    if (cooldownMs) {
      return {
        ok: false,
        code: 'RESEND_COOLDOWN',
        message: 'Aguarde um momento antes de reenviar o código.',
      };
    }
  } else if (existing && !isClientPortalOtpExpired(existing.expires_at)) {
    const cooldownMs =
      Date.now() - new Date(existing.last_sent_at).getTime() < CLIENT_PORTAL_OTP_RESEND_COOLDOWN_MS;
    if (cooldownMs) {
      return {
        ok: false,
        code: 'SEND_COOLDOWN',
        message: 'Aguarde um momento antes de solicitar um novo código.',
      };
    }
    await admin
      .from(TABLE)
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', existing.id);
  }

  const code = generateClientPortalOtpCode();
  const salt = createClientPortalOtpSalt();
  const otpHash = hashClientPortalOtp(code, salt);
  const expiresAt = buildClientPortalOtpExpiresAt();

  const sendResult = await sendClientPortalOtpWhatsApp(input.phone, code);
  if (!sendResult.ok) {
    return {
      ok: false,
      code: 'WHATSAPP_FAILED',
      message: sendResult.error || 'Não foi possível enviar o código por WhatsApp.',
    };
  }

  const resendCount = input.resend && existing ? existing.resend_count + 1 : 0;

  const { data, error } = await admin
    .from(TABLE)
    .insert({
      link_key: input.linkKey,
      document_hash: documentHash,
      otp_hash: otpHash,
      otp_salt: salt,
      phone_masked: input.phoneMasked,
      resend_count: resendCount,
      expires_at: expiresAt,
      last_sent_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    console.error('[client-portal-otp] insert error', error?.message);
    return { ok: false, code: 'PERSIST_ERROR', message: 'Não foi possível registrar o código.' };
  }

  return {
    ok: true,
    phoneMasked: input.phoneMasked,
    challengeId: String(data.id),
  };
}

export async function verifyClientPortalOtp(input: {
  challengeId: string;
  linkKey: string;
  documentDigits: string;
  code: string;
  adminClient?: SupabaseClient | null;
}): Promise<VerifyClientPortalOtpResult> {
  const admin = await getAdmin(input.adminClient);
  if (!admin) {
    return { ok: false, code: 'CONFIG_ERROR', message: 'Serviço indisponível.' };
  }

  if (!isValidClientPortalOtpInput(input.code)) {
    return { ok: false, code: 'INVALID_CODE', message: 'Informe o código de 6 dígitos.' };
  }

  const documentHash = hashClientPortalDocument(input.documentDigits);
  const normalizedCode = normalizeOtpInput(input.code);

  const { data, error } = await admin
    .from(TABLE)
    .select('*')
    .eq('id', input.challengeId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, code: 'CHALLENGE_NOT_FOUND', message: 'Código inválido ou expirado.' };
  }

  const row = data as ClientPortalOtpChallengeRow;

  if (row.link_key !== input.linkKey || row.document_hash !== documentHash) {
    return { ok: false, code: 'CHALLENGE_MISMATCH', message: 'Código inválido ou expirado.' };
  }

  if (row.consumed_at) {
    return { ok: false, code: 'OTP_REUSED', message: 'Este código já foi utilizado.' };
  }

  if (isClientPortalOtpExpired(row.expires_at)) {
    return { ok: false, code: 'OTP_EXPIRED', message: 'Código expirado. Solicite um novo código.' };
  }

  if (row.attempts >= CLIENT_PORTAL_OTP_MAX_ATTEMPTS) {
    return {
      ok: false,
      code: 'ATTEMPTS_EXCEEDED',
      message: 'Limite de tentativas excedido. Solicite um novo código.',
    };
  }

  const valid = verifyClientPortalOtpCode(normalizedCode, row.otp_salt, row.otp_hash);

  if (!valid) {
    const attempts = row.attempts + 1;
    await admin.from(TABLE).update({ attempts }).eq('id', row.id);
    return { ok: false, code: 'INVALID_CODE', message: 'Código inválido. Verifique e tente novamente.' };
  }

  await admin
    .from(TABLE)
    .update({ consumed_at: new Date().toISOString(), attempts: row.attempts + 1 })
    .eq('id', row.id);

  return { ok: true, linkKey: row.link_key, documentHash: row.document_hash };
}

/** Utilitário de testes — nunca expor código em produção. */
export function __testOnlyHashOtp(code: string, salt: string): string {
  return hashClientPortalOtp(code, salt);
}
