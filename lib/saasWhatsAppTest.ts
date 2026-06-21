/**
 * Envio manual de teste WhatsApp (Z-API) — painel Master SaaS.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeBrazilianWhatsAppPhone } from '@/lib/saasBillingReminderWhatsApp';
import { isZapiConfigured, sendText } from '@/lib/whatsapp/zapiProvider';

export const SAAS_WHATSAPP_TEST_MESSAGE = '✅ Teste de integração WhatsApp do SV LOTES';

export type SaasWhatsAppTestResult = {
  ok: boolean;
  normalizedPhone?: string | null;
  messageId?: string | null;
  error?: string;
};

async function resolveAuditCompanyId(
  supabaseAdmin: SupabaseClient,
  actorUserId: string,
): Promise<string | null> {
  const { data: actor } = await supabaseAdmin
    .from('users')
    .select('tenant_id')
    .eq('id', actorUserId)
    .maybeSingle();

  if (actor?.tenant_id) return String(actor.tenant_id);

  const { data: company } = await supabaseAdmin
    .from('companies')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return company?.id ? String(company.id) : null;
}

export async function insertSaasWhatsAppTestAudit(
  supabaseAdmin: SupabaseClient,
  input: {
    actorUserId: string;
    normalizedPhone: string;
    messageId?: string | null;
  },
): Promise<void> {
  const companyId = await resolveAuditCompanyId(supabaseAdmin, input.actorUserId);
  if (!companyId) return;

  await supabaseAdmin.from('audit_logs').insert({
    tenant_id: companyId,
    company_id: companyId,
    user_id: input.actorUserId,
    module: 'SAAS_BILLING',
    action: 'WHATSAPP_TEST_SENT',
    description: `Teste WhatsApp enviado para ${input.normalizedPhone}${
      input.messageId ? ` (id: ${input.messageId})` : ''
    }`,
    reference_id: input.actorUserId,
  });
}

export async function sendSaasWhatsAppTest(
  supabaseAdmin: SupabaseClient,
  input: { phone: string; actorUserId: string },
): Promise<SaasWhatsAppTestResult> {
  if (!isZapiConfigured()) {
    return { ok: false, error: 'Z-API não configurada.' };
  }

  const normalizedPhone = normalizeBrazilianWhatsAppPhone(input.phone);
  if (!normalizedPhone) {
    return { ok: false, normalizedPhone: null, error: 'Telefone inválido para WhatsApp.' };
  }

  const result = await sendText({
    phone: normalizedPhone,
    message: SAAS_WHATSAPP_TEST_MESSAGE,
  });

  if (!result.ok) {
    return {
      ok: false,
      normalizedPhone,
      error: result.error || 'Falha ao enviar WhatsApp de teste.',
    };
  }

  await insertSaasWhatsAppTestAudit(supabaseAdmin, {
    actorUserId: input.actorUserId,
    normalizedPhone,
    messageId: result.messageId ?? null,
  });

  return {
    ok: true,
    normalizedPhone,
    messageId: result.messageId ?? null,
  };
}
