/**
 * Envio WhatsApp do Portal do Cliente.
 *
 * Mesma resolução Z-API dos módulos server-side existentes:
 * - lib/saasBillingReminderWhatsApp.ts (lembretes automáticos SaaS)
 * - lib/saasWhatsAppTest.ts (teste Master)
 * - lib/whatsapp/zapiProvider.ts (provider único)
 *
 * Contratos e cobranças manuais usam wa.me no navegador — não passam por aqui.
 */

import { normalizeBrazilianWhatsAppPhone } from '@/lib/saasBillingReminderWhatsApp';
import {
  buildZapiRequestDiagnostics,
  isZapiConfigured,
  resolveZapiInstanceId,
  resolveZapiRuntimeEnvironment,
  sendText,
  type ZapiSendTextResult,
} from '@/lib/whatsapp/zapiProvider';

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

/** Log temporário de diagnóstico — sem tokens, OTP ou telefone completo. */
export function logClientPortalOtpZapiDiagnostic(
  result: Pick<ZapiSendTextResult, 'ok' | 'error' | 'debug'>,
): void {
  const diagnostics = buildZapiRequestDiagnostics();
  console.warn(
    '[client-portal-otp:zapi-diagnostic]',
    JSON.stringify({
      environment: resolveZapiRuntimeEnvironment(),
      messageType: CLIENT_PORTAL_OTP_MESSAGE_TYPE,
      instanceId: (diagnostics?.instanceId ?? resolveZapiInstanceId()) || null,
      instanceIdLength: diagnostics?.instanceIdLength ?? resolveZapiInstanceId().length,
      httpStatus: result.debug?.httpStatus ?? null,
      responseBody: result.debug?.responseBody ?? null,
      ok: result.ok,
      error: result.ok ? null : result.error ?? null,
    }),
  );
}

export async function sendClientPortalOtpWhatsApp(
  phone: string,
  code: string,
): Promise<SendClientPortalOtpWhatsAppResult> {
  if (!isZapiConfigured()) {
    logClientPortalOtpZapiDiagnostic({
      ok: false,
      error: 'Z-API não configurada.',
    });
    return { ok: false, error: 'Z-API não configurada.' };
  }

  const normalizedPhone = normalizeBrazilianWhatsAppPhone(phone);
  if (!normalizedPhone) {
    return { ok: false, normalizedPhone: null, error: 'Telefone inválido para WhatsApp.' };
  }

  const message = buildClientPortalOtpWhatsAppMessage(code);
  const result = await sendText({ phone: normalizedPhone, message });

  logClientPortalOtpZapiDiagnostic(result);

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
