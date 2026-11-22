/**
 * PUT da configuração C6 depois da sessão autenticada.
 * Não chama o banco de Production e não emite boleto.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assertC6ConfigResponseSafe,
  redactC6ErrorMessage,
  saveCompanyC6BankConfig,
} from '@/lib/banking/c6/c6ConfigRepository';
import type { C6BankConfigSaveInput } from '@/lib/banking/c6/c6ConfigTypes';
import { normalizeBankEnvironmentInput } from '@/lib/banking/integrationConfig';
import {
  readPrimaryAdminVerifyRequest,
  verifyPrimaryAdminPassword,
  type PrimaryAdminReauthDeps,
} from '@/lib/primaryAdminReauth';
import { persistPrimaryAdminVerifyAudit } from '@/lib/primaryAdminReauthServer';

export type C6ConfigPutResult = {
  status: number;
  body: Record<string, unknown>;
};

export async function executeC6ConfigPut(input: {
  admin: SupabaseClient;
  userId: string;
  tenantId: string;
  body: unknown;
  deps: PrimaryAdminReauthDeps;
  supabaseUrl?: string;
}): Promise<C6ConfigPutResult> {
  const record =
    input.body && typeof input.body === 'object' && !Array.isArray(input.body)
      ? (input.body as Record<string, unknown>)
      : {};
  const { password } = readPrimaryAdminVerifyRequest(record);
  const verify = await verifyPrimaryAdminPassword(input.deps, {
    operatorUserId: input.userId,
    password,
    companyId: input.tenantId,
  });
  await persistPrimaryAdminVerifyAudit(input.admin, verify);
  if (!verify.ok || verify.tenantId !== input.tenantId) {
    return { status: 403, body: { error: 'Autorização não concedida.' } };
  }

  try {
    const saveInput: C6BankConfigSaveInput = {
      environment: normalizeBankEnvironmentInput(record.environment),
      clientId: String(record.clientId ?? record.client_id ?? ''),
      clientSecret: String(record.clientSecret ?? record.client_secret ?? ''),
      certificatePem: String(record.certificatePem ?? record.certificate_pem ?? ''),
      certificateFileName: String(record.certificateFileName ?? record.certificate_file_name ?? ''),
      privateKeyPem: String(record.privateKeyPem ?? record.private_key_pem ?? ''),
      privateKeyFileName: String(record.privateKeyFileName ?? record.private_key_file_name ?? ''),
      financialAccountId:
        String(record.financialAccountId ?? record.financial_account_id ?? '').trim() || null,
      boletoIntent: record.boletoIntent === true,
      bolepixIntent: record.bolepixIntent === true,
    };
    const config = await saveCompanyC6BankConfig(
      input.admin,
      input.tenantId,
      saveInput,
      { financialAccountId: saveInput.financialAccountId },
      { supabaseUrl: input.supabaseUrl },
    );
    assertC6ConfigResponseSafe(config);
    return { status: 200, body: { config } };
  } catch (error) {
    const message = redactC6ErrorMessage(error, 'Erro ao salvar configuração C6.');
    console.error('[banking/c6/config PUT]', message);
    const status =
      message.includes('não correspondem') ||
      message.includes('inválid') ||
      message.includes('obrigatório') ||
      message.includes('juntos')
        ? 400
        : 500;
    return { status, body: { error: message } };
  }
}
