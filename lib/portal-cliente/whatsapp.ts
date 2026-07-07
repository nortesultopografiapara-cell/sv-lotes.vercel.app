/**
 * Envio WhatsApp do Portal do Cliente — reutiliza Z-API existente.
 * Não altera providers, cobranças ou contratos.
 */

import { normalizeBrazilianWhatsAppPhone } from '@/lib/saasBillingReminderWhatsApp';
import { isZapiConfigured, sendText } from '@/lib/whatsapp/zapiProvider';

export const CLIENT_PORTAL_OTP_MESSAGE_TYPE = 'CLIENT_PORTAL_OTP' as const;

export function buildClientPortalOtpWhatsAppMessage(code: string): string {
  return [
    'SV LOTES',
    '',
    'Seu código de acesso ao Portal do Cliente é:',
    '',
    code,
    '',
    'Este código é válido por 5 minutos.',
    '',
    'Caso você não tenha solicitado este acesso, ignore esta mensagem.',
  ].join('\n');
}

export type SendClientPortalOtpWhatsAppResult = {
  ok: boolean;
  normalizedPhone?: string | null;
  providerId?: string | null;
  error?: string;
};

export function isClientPortalWhatsAppConfigured(): boolean {
  return isZapiConfigured();
}

export async function sendClientPortalOtpWhatsApp(
  phone: string,
  code: string,
): Promise<SendClientPortalOtpWhatsAppResult> {
  if (!isClientPortalWhatsAppConfigured()) {
    return { ok: false, error: 'WhatsApp não configurado no momento.' };
  }

  const normalizedPhone = normalizeBrazilianWhatsAppPhone(phone);
  if (!normalizedPhone) {
    return { ok: false, normalizedPhone: null, error: 'Telefone inválido para WhatsApp.' };
  }

  const message = buildClientPortalOtpWhatsAppMessage(code);
  const result = await sendText({ phone: normalizedPhone, message });

  if (!result.ok) {
    return {
      ok: false,
      normalizedPhone,
      error: result.error || 'Falha ao enviar WhatsApp.',
    };
  }

  return {
    ok: true,
    normalizedPhone,
    providerId: result.messageId ?? null,
  };
}
