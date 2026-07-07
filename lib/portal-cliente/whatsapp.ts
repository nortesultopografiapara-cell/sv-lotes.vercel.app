/**
 * Envio WhatsApp do Portal do Cliente — mesma camada Z-API das cobranças SaaS.
 * Reutiliza sendText / isSaasBillingWhatsAppConfigured sem provider paralelo.
 */

import {
  isSaasBillingWhatsAppConfigured,
  normalizeBrazilianWhatsAppPhone,
} from '@/lib/saasBillingReminderWhatsApp';
import { getZapiConfigStatus, sendText } from '@/lib/whatsapp/zapiProvider';

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

export async function sendClientPortalOtpWhatsApp(
  phone: string,
  code: string,
): Promise<SendClientPortalOtpWhatsAppResult> {
  if (!isSaasBillingWhatsAppConfigured()) {
    const status = getZapiConfigStatus();
    console.warn(
      '[client-portal-otp:whatsapp-config]',
      JSON.stringify({
        type: CLIENT_PORTAL_OTP_MESSAGE_TYPE,
        ready: status.ready,
        instanceConfigured: status.instanceConfigured,
        tokenConfigured: status.tokenConfigured,
        clientTokenConfigured: status.clientTokenConfigured,
      }),
    );
    return { ok: false, error: 'WhatsApp não configurado no momento.' };
  }

  const normalizedPhone = normalizeBrazilianWhatsAppPhone(phone);
  if (!normalizedPhone) {
    return { ok: false, normalizedPhone: null, error: 'Telefone inválido para WhatsApp.' };
  }

  const message = buildClientPortalOtpWhatsAppMessage(code);
  const result = await sendText({ phone: normalizedPhone, message });

  if (!result.ok) {
    console.warn(
      '[client-portal-otp:whatsapp-send]',
      JSON.stringify({
        type: CLIENT_PORTAL_OTP_MESSAGE_TYPE,
        phoneSuffix: normalizedPhone.slice(-4),
        error: result.error,
      }),
    );
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
